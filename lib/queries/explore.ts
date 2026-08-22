import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callModel } from "@/lib/ai/call-model";

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
};

// Below this word/char threshold a query reads more like a keyword than a
// phrase — trigram similarity on the literal text serves that better (and
// cheaper) than a semantic embedding, which shines on longer, meaning-based
// queries. Both paths still degrade to trigram if AI_ENABLED is false or
// the embedding call fails, so /explore search never goes fully dark.
const SEMANTIC_MIN_LENGTH = 12;

async function fetchQuestRows(filters: ExploreFilters) {
  const supabase = await createClient();
  const trimmed = filters.query?.trim() ?? "";

  let rows: any[] | null = null;

  if (trimmed.length > 0) {
    const useSemantic = trimmed.length >= SEMANTIC_MIN_LENGTH && process.env.AI_ENABLED === "true";

    if (useSemantic) {
      try {
        const result = await callModel({ task: "embed", text: trimmed });
        if (result.task === "embed") {
          const { data, error } = await supabase.rpc("search_quests_semantic", {
            query_embedding: `[${result.embedding.join(",")}]`,
          });
          if (!error) rows = data;
        }
      } catch {
        // falls through to trigram below
      }
    }

    if (!rows) {
      const { data, error } = await supabase.rpc("search_quests_trigram", { search_query: trimmed });
      if (!error) rows = data;
    }
  }

  if (!rows) {
    let query = supabase.from("quests").select("*").order("id");
    if (filters.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }
    if (filters.groupSize && filters.groupSize !== "any") {
      query = query.eq("group_size", filters.groupSize);
    }
    const { data, error } = await query.limit(200);
    if (!error) rows = data;
  } else {
    // RPC paths don't take filter params — apply them in-memory on the
    // (already small, <=60 row) result set instead of a second round trip.
    rows = rows.filter((r) => {
      if (filters.category && filters.category !== "all" && r.category !== filters.category) return false;
      if (filters.groupSize && filters.groupSize !== "any" && r.group_size !== filters.groupSize) return false;
      return true;
    });
  }

  return rows ?? [];
}

export async function searchQuests(filters: ExploreFilters): Promise<ExploreQuest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [rows, ownedQuestIds] = await Promise.all([
    fetchQuestRows(filters),
    user
      ? supabase
          .from("list_items")
          .select("quest_id")
          .eq("owner_id", user.id)
          .not("quest_id", "is", null)
          .then(({ data }) => new Set((data ?? []).map((r) => r.quest_id)))
      : Promise.resolve(new Set<string>()),
  ]);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    groupSize: row.group_size,
    locale: row.locale,
    spice: row.spice,
    alreadyAdded: ownedQuestIds.has(row.id),
  }));
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
