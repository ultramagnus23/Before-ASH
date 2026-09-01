import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callModel } from "@/lib/ai/call-model";
import { rankQuests, diversifyByCategory } from "@/lib/ranking/rank-quests";

// The raw snake_case shape returned by the quests table and by the
// search_quests_semantic/search_quests_trigram RPCs — both untyped (no
// Database generic on the Supabase client, and RPC return types aren't
// inferred from the select-string parser at all). This is the shape every
// row-mapping function in this file actually receives.
type QuestRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: number;
  group_size: string;
  locale: string;
  spice: number;
};

export type ExploreQuest = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: number;
  groupSize: string;
  locale: string;
  spice: number;
  alreadyAdded: boolean;
};

export type ExploreFilters = {
  query?: string;
  category?: string;
  groupSize?: string;
  locale?: string;
  difficulty?: string; // "1" | "2" | "3" | "any" (arrives as a string from a URL search param)
  spice?: string;
  // 1-indexed. Only applies to the plain-browse path (no search query) —
  // the trigram/semantic RPCs already return a relevance-capped ≤60 rows,
  // which needs no pagination of its own.
  page?: number;
};

export type ExploreResult = {
  quests: ExploreQuest[];
  total: number;
  page: number;
  pageSize: number;
  // Did the result order come from ranking/relevance rather than a plain
  // id order? Drives the one-line "how this was sorted" note on /explore —
  // see WORK-PROMPT-v3.md Phase 2 item 5.
  orderedBy: "relevance-semantic" | "relevance-wording" | "ranked";
};

function applyDimensionFilters<T extends { category: string; group_size: string; locale: string; difficulty: number; spice: number }>(
  rows: T[],
  filters: ExploreFilters
): T[] {
  return rows.filter((r) => {
    if (filters.category && filters.category !== "all" && r.category !== filters.category) return false;
    if (filters.groupSize && filters.groupSize !== "any" && r.group_size !== filters.groupSize) return false;
    if (filters.locale && filters.locale !== "any" && r.locale !== filters.locale) return false;
    if (filters.difficulty && filters.difficulty !== "any" && String(r.difficulty) !== filters.difficulty) return false;
    if (filters.spice && filters.spice !== "any" && String(r.spice) !== filters.spice) return false;
    return true;
  });
}

// Below this word/char threshold a query reads more like a keyword than a
// phrase — trigram similarity on the literal text serves that better (and
// cheaper) than a semantic embedding, which shines on longer, meaning-based
// queries. Both paths still degrade to trigram if AI_ENABLED is false or
// the embedding call fails, so /explore search never goes fully dark.
const SEMANTIC_MIN_LENGTH = 12;

// Was a hard `.limit(200)` with no way to reach the rest of the catalog —
// 291 of 491 items were unreachable by browsing. Real pagination instead.
const PAGE_SIZE = 60;

async function fetchSearchRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trimmed: string
): Promise<{ rows: QuestRow[]; orderedBy: "relevance-semantic" | "relevance-wording" } | null> {
  const useSemantic = trimmed.length >= SEMANTIC_MIN_LENGTH && process.env.AI_ENABLED === "true";

  if (useSemantic) {
    try {
      const result = await callModel({ task: "embed", text: trimmed });
      if (result.task === "embed") {
        const { data, error } = await supabase.rpc("search_quests_semantic", {
          query_embedding: `[${result.embedding.join(",")}]`,
        });
        if (!error) return { rows: data, orderedBy: "relevance-semantic" };
      }
    } catch {
      // falls through to trigram below
    }
  }

  const { data, error } = await supabase.rpc("search_quests_trigram", { search_query: trimmed });
  if (!error) return { rows: data, orderedBy: "relevance-wording" };
  return null;
}

export async function searchQuests(filters: ExploreFilters): Promise<ExploreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ownedQuestIds, openCounts] = await Promise.all([
    user
      ? supabase
          .from("list_items")
          .select("quest_id")
          .eq("owner_id", user.id)
          .not("quest_id", "is", null)
          .then(({ data }) => new Set((data ?? []).map((r) => r.quest_id)))
      : Promise.resolve(new Set<string>()),
    // security invoker (db/migrations/0008) — only ever counts rows RLS
    // already lets this caller see. Fetched unconditionally (not just for
    // logged-in users) since it drives ranking for anonymous browsing too.
    supabase
      .rpc("quest_open_counts")
      .then(
        ({ data }) =>
          new Map<string, number>(
            (data ?? []).map((r: { quest_id: string; open_count: number }): [string, number] => [
              r.quest_id,
              Number(r.open_count),
            ])
          )
      ),
  ]);

  const toExploreQuest = (row: QuestRow): ExploreQuest => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    groupSize: row.group_size,
    locale: row.locale,
    spice: row.spice,
    alreadyAdded: ownedQuestIds.has(row.id),
  });

  const trimmed = filters.query?.trim() ?? "";

  if (trimmed.length > 0) {
    const search = await fetchSearchRows(supabase, trimmed);
    if (search) {
      // RPC paths don't take filter params — apply them in-memory on the
      // (already small, <=60 row) result set instead of a second round
      // trip. No pagination: a search result is already a bounded,
      // relevance-ordered set, not something you page through. Relevance
      // order is left untouched by rankQuests — a query answers a
      // question, and that should win outright over popularity.
      const rows = applyDimensionFilters(search.rows, filters);
      return {
        quests: rows.map(toExploreQuest),
        total: rows.length,
        page: 1,
        pageSize: PAGE_SIZE,
        orderedBy: search.orderedBy,
      };
    }
    // Both RPCs failed (e.g. AI_ENABLED false and the trigram call itself
    // errored) — fall through to plain browse below rather than going dark.
  }

  // Plain browse: fetch every row matching the filters (491 rows max, tiny
  // for a single query), rank + diversify in memory, then paginate the
  // already-ordered list. Doing it this way — not `order by id` + a DB
  // range — is what makes "how many people have it open" and "not already
  // on your list" apply globally instead of only within one arbitrary
  // id-ordered page.
  let query = supabase.from("quests").select("*");
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
  if (filters.groupSize && filters.groupSize !== "any") query = query.eq("group_size", filters.groupSize);
  if (filters.locale && filters.locale !== "any") query = query.eq("locale", filters.locale);
  if (filters.difficulty && filters.difficulty !== "any") query = query.eq("difficulty", Number(filters.difficulty));
  if (filters.spice && filters.spice !== "any") query = query.eq("spice", Number(filters.spice));
  const { data, error } = await query.order("id");
  const allRows = error ? [] : (data ?? []);

  const ranked = diversifyByCategory(
    rankQuests(allRows, { openCounts, ownedQuestIds })
  );

  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const pageRows = ranked.slice(from, from + PAGE_SIZE);

  return {
    quests: pageRows.map(toExploreQuest),
    total: ranked.length,
    page,
    pageSize: PAGE_SIZE,
    orderedBy: "ranked",
  };
}

// "Deal me something" — picks one quest uniformly at random from whatever
// the current Who/Where/Effort/Edge/category filters match. Two queries
// (count, then one indexed row), not a client-side shuffle over the whole
// candidate set, so it stays cheap even if the catalog grows well past 491.
export async function getRandomQuestSlug(filters: ExploreFilters): Promise<string | null> {
  const supabase = await createClient();

  function buildQuery() {
    let q = supabase.from("quests").select("slug", { count: "exact" });
    if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
    if (filters.groupSize && filters.groupSize !== "any") q = q.eq("group_size", filters.groupSize);
    if (filters.locale && filters.locale !== "any") q = q.eq("locale", filters.locale);
    if (filters.difficulty && filters.difficulty !== "any") q = q.eq("difficulty", Number(filters.difficulty));
    if (filters.spice && filters.spice !== "any") q = q.eq("spice", Number(filters.spice));
    return q;
  }

  const { count } = await buildQuery().range(0, 0);
  if (!count) return null;

  const index = Math.floor(Math.random() * count);
  const { data } = await buildQuery().range(index, index);
  return data?.[0]?.slug ?? null;
}

export type RelatedQuest = {
  id: string;
  slug: string;
  title: string;
  category: string;
  alreadyAdded: boolean;
};

// "More like this" on /q/[slug] — reuses the quest's OWN already-computed
// embedding (PostgREST returns pgvector as the same "[0.1,0.2,...]" text
// search_quests_semantic's query_embedding param expects) rather than
// making a fresh callModel({task:"embed"}) call. Zero extra AI cost: the
// backfill in scripts/backfill-embeddings.ts already paid for this vector.
export async function getRelatedQuests(questId: string, embedding: string | null): Promise<RelatedQuest[]> {
  if (!embedding) return [];
  const supabase = await createClient();

  const [{ data: neighbors, error }, ownedQuestIds] = await Promise.all([
    supabase.rpc("search_quests_semantic", { query_embedding: embedding, result_limit: 6 }),
    getOwnedQuestIds(supabase),
  ]);
  if (error || !neighbors) return [];

  return (neighbors as QuestRow[])
    .filter((row) => row.id !== questId)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      alreadyAdded: ownedQuestIds.has(row.id),
    }));
}

async function getOwnedQuestIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase.from("list_items").select("quest_id").eq("owner_id", user.id).not("quest_id", "is", null);
  return new Set((data ?? []).map((r) => r.quest_id));
}

export async function getCategories(): Promise<{ key: string; label: string }[]> {
  // Static per seed-quests.json's 15 categories — cheap to hardcode here
  // rather than round-trip a rarely-changing lookup table.
  return [
    { key: "all", label: "Everything" },
    { key: "campus_ritual", label: "Campus rituals" },
    { key: "academic", label: "Academic" },
    { key: "food", label: "Food" },
    { key: "people", label: "People" },
    { key: "creative", label: "Make something" },
    { key: "body_sport", label: "Body" },
    { key: "delhi_ncr", label: "Off campus" },
    { key: "career_money", label: "Career and money" },
    { key: "service", label: "Give something" },
    { key: "solitude", label: "Alone" },
    { key: "night", label: "After midnight" },
    { key: "legacy", label: "Before you leave" },
    { key: "chaos", label: "Chaotic good" },
    { key: "skills", label: "Learn something" },
    { key: "admin_life", label: "Unglamorous" },
  ];
}
