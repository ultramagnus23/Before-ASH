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

// OWN_COLUMNS is a variable, not a literal passed directly to .select(), so
// Supabase's select-string type inference can't run against it at all — the
// row type would otherwise collapse to `any`. quest is a to-one FK (this
// file's serializer only ever reads a single title off it); item_posts is
// the one genuinely to-many relation in this file (an item can carry both
// a blog and a comment post).
type OwnListRow = {
  id: string;
  quest_id: string | null;
  custom_title: string | null;
  category: string;
  visibility: "private" | "anonymous" | "public";
  review_state: string;
  note: string | null;
  proof: string | null;
  completed_at: string | null;
  appealed_at: string | null;
  created_at: string;
  quest: { title: string } | null;
  item_posts: { body: string; links: { label: string; url: string }[]; review_state: string; kind: string }[];
};

// Explicitly does not select `note` — this is the whole point of the file.
const PUBLIC_COLUMNS =
  "id, category, custom_title, proof, completed_at, visibility, owner_id, quest:quests(id,title,slug), owner:profiles(handle)";

// Exported only so tests/unit/serializers.test.ts can assert on it directly.
export const PUBLIC_COLUMNS_FOR_TEST = PUBLIC_COLUMNS;

// The ROW-level half of this file's second layer.
//
// Every public reader below used to filter only on `completed_at` and leave
// visibility entirely to RLS. That is not equivalent: RLS grants an owner
// their OWN rows unconditionally (`list_items_select_own`), so a user's
// private, never-reviewed items appeared to that user in surfaces that are
// supposed to show campus activity — /feed rendered a fixture user's 20
// private, `review_state='draft'` completions under their own handle.
//
// Not a cross-user leak (`list_items_select_public_approved` still blocks
// everyone else, so BUILD-PROMPT.md non-negotiable #1 held), but wrong, and
// wrong in the direction that makes an empty feed look populated to the one
// person who can't tell the difference.
//
// These predicates deliberately mirror `list_items_select_public_approved`
// exactly, so a public reader returns the same rows for the owner as it does
// for a stranger. 'flagged' is excluded because RLS excludes it — see the
// note in the README about ListRow's "Visible to campus" copy for flagged
// items, which that policy already contradicts and which is a separate fix.
const PUBLIC_VISIBILITIES = ["public", "anonymous"] as const;
const PUBLIC_REVIEW_STATE = "approved";

export async function getOwnList(userId: string): Promise<OwnListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select(OWN_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as OwnListRow[]).map((row) => ({
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
      const blog = (row.item_posts ?? []).find((p) => p.kind === "blog");
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

  // RLS excludes rows from blocked/blocking users, which is not re-stated
  // here. Visibility and review state ARE re-stated, because RLS alone lets
  // an owner see their own private rows — see PUBLIC_VISIBILITIES above.
  let query = supabase
    .from("list_items")
    .select(PUBLIC_COLUMNS)
    .in("visibility", PUBLIC_VISIBILITIES)
    .eq("review_state", PUBLIC_REVIEW_STATE)
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
    .eq("review_state", PUBLIC_REVIEW_STATE)
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
    .in("visibility", PUBLIC_VISIBILITIES)
    .eq("review_state", PUBLIC_REVIEW_STATE)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PublicRow[]).map((row) => toPublicListItem(row, viewerId));
}
