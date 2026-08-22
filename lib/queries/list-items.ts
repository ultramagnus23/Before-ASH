import "server-only";
import { createClient } from "@/lib/supabase/server";

/*
 * All list_items reads go through this file — never a raw `.from("list_items")`
 * at the call site elsewhere in the app. That's what makes "note never
 * appears in a public serializer" (BUILD-PROMPT.md #2) a property of the
 * type system: PublicListItem has no `note` field, so a component rendering
 * one literally cannot reference it.
 */

export type OwnListItem = {
  id: string;
  questId: string | null;
  customTitle: string | null;
  title: string; // resolved from quest title or custom_title
  category: string;
  visibility: "private" | "anonymous" | "public";
  reviewState: string;
  note: string | null; // only ever present on the OWNER's own view
  proof: string | null;
  completedAt: string | null;
  appealedAt: string | null;
  createdAt: string;
  blogPost: { body: string; links: { label: string; url: string }[]; reviewState: string } | null;
};

export type PublicListItem = {
  id: string;
  category: string;
  title: string; // resolved from quest title or custom_title, never raw owner data
  questId: string | null; // for "add it" — null for a fully custom item, safe to expose (not owner data)
  questSlug: string | null; // for linking to /q/[slug]
  visibility: "public" | "anonymous";
  proof: string | null;
  completedAt: string | null;
  ownerHandle: string | null; // ALWAYS null when visibility === 'anonymous'
  isOwnItem: boolean; // computed against the current viewer, never against a stranger
};

const OWN_COLUMNS =
  "id, quest_id, custom_title, category, visibility, review_state, note, proof, completed_at, appealed_at, created_at, quest:quests(title), item_posts(body, links, review_state, kind)";

// Explicitly does not select `note` — this is the whole point of the file.
const PUBLIC_COLUMNS =
  "id, category, custom_title, proof, completed_at, visibility, owner_id, quest:quests(id,title,slug), owner:profiles(handle)";

// Exported only so tests/unit/serializers.test.ts can assert on it directly.
export const PUBLIC_COLUMNS_FOR_TEST = PUBLIC_COLUMNS;

export async function getOwnList(userId: string): Promise<OwnListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select(OWN_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    questId: row.quest_id,
    customTitle: row.custom_title,
    title: row.quest?.title ?? row.custom_title ?? "",
    category: row.category,
    visibility: row.visibility,
    reviewState: row.review_state,
    note: row.note,
    proof: row.proof,
    completedAt: row.completed_at,
    appealedAt: row.appealed_at,
    createdAt: row.created_at,
    blogPost: (() => {
      const blog = (row.item_posts ?? []).find((p: any) => p.kind === "blog");
      return blog ? { body: blog.body, links: blog.links ?? [], reviewState: blog.review_state } : null;
    })(),
  }));
}

type PublicRow = {
  id: string;
  category: string;
  custom_title: string | null;
  proof: string | null;
  completed_at: string | null;
  visibility: "public" | "anonymous";
  owner_id: string;
  quest?: { id: string; title: string; slug: string } | null;
  owner?: { handle: string } | null;
  [key: string]: unknown; // tolerate an over-selected row without ever reading from it below
};

// Pure mapping, exported separately so tests/unit/serializers.test.ts can
// prove `note` never survives into a PublicListItem WITHOUT needing a live
// database — even if a future refactor widens PUBLIC_COLUMNS by accident
// and `note` leaks into the raw row, this mapper still must not copy it.
// `viewerId` never appears in the output — it's only used to compute
// isOwnItem, which is a boolean, not an identifier.
export function toPublicListItem(row: PublicRow, viewerId: string | null): PublicListItem {
  return {
    id: row.id,
    category: row.category,
    title: row.quest?.title ?? row.custom_title ?? "",
    questId: row.quest?.id ?? null,
    questSlug: row.quest?.slug ?? null,
    visibility: row.visibility,
    proof: row.proof,
    completedAt: row.completed_at,
    ownerHandle: row.visibility === "anonymous" ? null : (row.owner?.handle ?? null),
    isOwnItem: viewerId !== null && row.owner_id === viewerId,
  };
}

async function currentViewerId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type FeedPage = { items: PublicListItem[]; nextCursor: string | null };

// Cursor-paginated by completed_at alone (no tiebreaker column) — a
// millisecond-collision skipping or repeating one item at the exact same
// timestamp is an acceptable v1 tradeoff, not worth the extra query
// complexity of a compound cursor for a campus-scale feed.
export async function getFeedPage(cursor: string | null, limit = 20): Promise<FeedPage> {
  const supabase = await createClient();
  const viewerId = await currentViewerId(supabase);

  // RLS already restricts this to visibility in ('public','anonymous') AND
  // review_state = 'approved', per db/migrations/0001_rls.sql, and already
  // excludes rows from blocked/blocking users. The column selection here is
  // a second, independent layer against the same note/owner-stripping rule.
  let query = supabase
    .from("list_items")
    .select(PUBLIC_COLUMNS)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("completed_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as PublicRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const lastRow = page[page.length - 1];
  return {
    items: page.map((row) => toPublicListItem(row, viewerId)),
    nextCursor: hasMore && lastRow ? lastRow.completed_at : null,
  };
}

export async function getPublicItemsByOwnerHandle(handle: string): Promise<PublicListItem[]> {
  const supabase = await createClient();
  const viewerId = await currentViewerId(supabase);

  const { data: profile } = await supabase.from("profiles").select("id").eq("handle", handle).maybeSingle();
  if (!profile) return [];

  // visibility='public' only, never 'anonymous' — an anonymous item must
  // never be attributable to a person anywhere, including implicitly by
  // appearing on their profile page.
  const { data, error } = await supabase
    .from("list_items")
    .select(PUBLIC_COLUMNS)
    .eq("owner_id", profile.id)
    .eq("visibility", "public")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PublicRow[]).map((row) => toPublicListItem(row, viewerId));
}

export async function getPublicItemsByQuestId(questId: string): Promise<PublicListItem[]> {
  const supabase = await createClient();
  const viewerId = await currentViewerId(supabase);

  const { data, error } = await supabase
    .from("list_items")
    .select(PUBLIC_COLUMNS)
    .eq("quest_id", questId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PublicRow[]).map((row) => toPublicListItem(row, viewerId));
}
