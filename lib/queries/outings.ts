import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export type OutingSummary = {
  id: string;
  questTitle: string;
  questSlug: string;
  memberCount: number;
  createdAt: string;
};

type Row = {
  group_id: string;
  outing_groups:
    | { id: string; created_at: string; quests: { title: string; slug: string } | { title: string; slug: string }[] | null }
    | { id: string; created_at: string; quests: { title: string; slug: string } | { title: string; slug: string }[] | null }[]
    | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * The outings the viewer is in.
 *
 * The user_id filter is NOT redundant with RLS, and leaving it off was a
 * bug: the policy grants a member visibility of every member row in their
 * groups — which is what the ledger needs — so an unfiltered select returns
 * one row per person per group, and a two-person outing appeared twice in
 * the list. RLS scopes this to the caller's GROUPS; only the filter scopes
 * it to the caller's own membership.
 */
export async function getMyOutings(): Promise<OutingSummary[]> {
  const supabase = await createClient();

  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("outing_group_members")
    .select("group_id, outing_groups(id, created_at, quests(title, slug))")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const groupIds = rows.map((r) => r.group_id);

  // Member counts come from a second query rather than an aggregate in the
  // select above: PostgREST's count-in-embed only counts rows the CALLER
  // can see, and members of a group can see each other, so this is honest.
  const counts = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("outing_group_members")
      .select("group_id")
      .in("group_id", groupIds);
    for (const row of memberRows ?? []) {
      const id = row.group_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return rows.flatMap((row) => {
    const group = one(row.outing_groups);
    if (!group) return [];
    const quest = one(group.quests);
    return [
      {
        id: group.id,
        questTitle: quest?.title ?? "Something",
        questSlug: quest?.slug ?? "",
        memberCount: counts.get(group.id) ?? 1,
        createdAt: group.created_at,
      },
    ];
  });
}

export type OutingHeader = { id: string; questTitle: string; questSlug: string };

export async function getOutingHeader(groupId: string): Promise<OutingHeader | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outing_groups")
    .select("id, quests(title, slug)")
    .eq("id", groupId)
    .maybeSingle();
  if (!data) return null;

  const quest = one((data as { quests: { title: string; slug: string } | { title: string; slug: string }[] | null }).quests);
  return { id: data.id as string, questTitle: quest?.title ?? "Something", questSlug: quest?.slug ?? "" };
}
