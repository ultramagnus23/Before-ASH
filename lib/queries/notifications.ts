import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";

/*
 * Exactly four notification types exist, closed as a Postgres enum in
 * db/migrations/0014_match_mechanic.sql. The copy for each lives here, in
 * one place, so a fifth type cannot be added by writing a string somewhere.
 *
 * No push, no email, no read receipts — in-app only, per the product rules.
 */
export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "board_activity"
  | "match_found";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  detail: string | null;
  href: string | null;
  unread: boolean;
  createdAt: string;
};

type Row = {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  quest: { title: string; slug: string } | { title: string; slug: string }[] | null;
};

// Dry, second-person, no exclamation marks — the same register as the rest
// of the product's system copy.
function present(row: Row): { title: string; detail: string | null; href: string | null } {
  const quest = one(row.quest);
  switch (row.type) {
    case "match_found":
      return {
        title: "Someone else is in",
        detail: quest ? `You both want to do "${quest.title}".` : "You both want to do the same thing.",
        href: quest ? `/q/${quest.slug}` : null,
      };
    case "connection_request":
      return { title: "Someone asked to connect", detail: null, href: "/connections" };
    case "connection_accepted":
      return { title: "Your request was accepted", detail: null, href: "/connections" };
    case "board_activity":
      return {
        title: "Activity on a board",
        detail: null,
        href: typeof row.payload?.board_id === "string" ? `/boards/${row.payload.board_id}` : "/boards",
      };
  }
}

export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  const supabase = await createClient();

  // RLS restricts this to the caller's own rows; no owner filter is written,
  // so there is exactly one place this can go wrong.
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Omit<Row, "quest">[];

  // The quest id lives in the payload, not in a column — notifications are
  // deliberately generic over four unrelated types, so there is no FK to
  // embed through. One extra query resolves every title at once rather than
  // N queries or a join that cannot exist.
  const questIds = [
    ...new Set(
      rows
        .map((r) => r.payload?.quest_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ];

  const titles = new Map<string, { title: string; slug: string }>();
  if (questIds.length > 0) {
    const { data: quests } = await supabase.from("quests").select("id, title, slug").in("id", questIds);
    for (const q of quests ?? []) titles.set(q.id, { title: q.title, slug: q.slug });
  }

  return rows.map((r) => {
    const questId = typeof r.payload?.quest_id === "string" ? r.payload.quest_id : null;
    const row = { ...r, quest: questId ? titles.get(questId) ?? null : null } as Row;
    return {
      id: row.id,
      type: row.type,
      unread: !row.read_at,
      createdAt: row.created_at,
      ...present(row),
    };
  });
}

/** Mark everything currently unread as read. Own rows only, via RLS. */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}

/**
 * Unread count for the nav badge.
 *
 * This is a count of things addressed to you that you have not read — not a
 * denominator. §1 bans "X of Y", totals of how many items exist, and
 * completion fractions; an unread badge is none of those, and removing it
 * would make the only delivery channel invisible.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
