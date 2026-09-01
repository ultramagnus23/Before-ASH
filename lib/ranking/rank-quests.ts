/*
 * Default /explore ordering, replacing a flat `order by id`. Two real
 * signals today; a third (seasonality/time-of-year fit) is intentionally
 * NOT here yet — the catalog has no season/best-time field to read (see
 * AUDIT-2026-08.md §2.1 finding 5 and WORK-PROMPT-v3.md Phase 4 item 5,
 * which adds that field). Wiring a seasonality weight against data that
 * doesn't exist would just be a fabricated signal; this module only scores
 * what it can actually justify.
 *
 * Both signals are pure functions of data the caller already has — no
 * network calls in here — so this module is unit-testable without a
 * database. Search-result ordering (trigram/semantic relevance) is NOT run
 * through this: a query answers a question, and relevance should win
 * outright, not get re-sorted by popularity.
 */

export type RankableQuest = {
  id: string;
  difficulty: number; // 1-3
  // Both optional so this module stays unit-testable with minimal fixtures
  // and degrades to neutral rather than throwing if a caller ever selects a
  // narrower row. Real callers (lib/queries/explore.ts) always pass them.
  spice?: number; // 1-3, the catalog's "edge" rating
  category?: string;
};

export type RankingContext = {
  // quest id -> how many people currently have it on their list, unstamped.
  // Sourced from quest_open_counts() (db/migrations/0008), a
  // `security invoker` RPC — it only ever counts rows RLS already lets the
  // caller see, so a private item can never inflate anyone else's count.
  openCounts: Map<string, number>;
  // quest ids already on the viewer's own list (any visibility).
  ownedQuestIds: Set<string>;
};

const WEIGHTS = {
  // Signal 1 — live popularity: more people currently trying a quest right
  // now outranks one nobody has picked up. log1p, not the raw count, so one
  // quest with 40 opens doesn't blot out everything else on the page.
  openCount: 1,
  // Signal 2 — novelty: a quest not already on the viewer's own list is
  // worth surfacing more than one they've already added, so the index
  // skews toward what a returning visitor hasn't seen rather than
  // reflecting their own list back at them. Weighted higher than
  // popularity on purpose — an unseen quest with zero opens should still
  // usually beat a popular one you've already got.
  novelty: 2.5,
  // Signal 3 — edge, as a COLD-START tiebreak only. Without this, an
  // untouched catalog (every openCount 0, nothing owned) scores every
  // single quest identically, so the sort collapsed to the caller's input
  // order — which is `order by id`, which put the admin_life block ("AD-"
  // ids) first purely alphabetically. The index and the "coolest side
  // quests" board both opened on doing your laundry and filing documents:
  // the dullest 20 rows in a 491-item catalog, by accident of the id
  // scheme. Deliberately small (0.35 per point above spice 1, so a 0.7
  // spread at most) — roughly two people opening a quest (log1p(2) ≈ 1.1)
  // already outweighs it, so this only decides the order while there's no
  // real signal to decide it instead, and never overrides one.
  edge: 0.35,
} as const;

function scoreQuest(quest: RankableQuest, ctx: RankingContext): number {
  const openCount = ctx.openCounts.get(quest.id) ?? 0;
  const novelty = ctx.ownedQuestIds.has(quest.id) ? 0 : 1;
  const edge = Math.max(0, (quest.spice ?? 1) - 1);
  return (
    WEIGHTS.openCount * Math.log1p(openCount) +
    WEIGHTS.novelty * novelty +
    WEIGHTS.edge * edge
  );
}

// Stable: ties keep the input order (which callers pass in as id order),
// so ranking never looks like it's shuffling on every request.
export function rankQuests<T extends RankableQuest>(quests: T[], ctx: RankingContext): T[] {
  return quests
    .map((quest, index) => ({ quest, index, score: scoreQuest(quest, ctx) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.quest);
}

// Signal 3 — difficulty spread: a property of the SEQUENCE, not any one
// item, so it's a re-ordering pass after scoring rather than a weight
// inside scoreQuest. Buckets by difficulty (each bucket keeps its
// rank-order from rankQuests), then round-robins across buckets so no two
// consecutive rows share a difficulty level unless one bucket is so large
// relative to the others that it's genuinely unavoidable.
function roundRobinBy<T, K>(items: T[], keyOf: (item: T) => K): T[] {
  const buckets = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const bucketKeys = [...buckets.keys()];

  const result: T[] = [];
  let remaining = items.length;
  while (remaining > 0) {
    for (const key of bucketKeys) {
      const next = buckets.get(key)!.shift();
      if (next !== undefined) {
        result.push(next);
        remaining--;
      }
    }
  }
  return result;
}

export function diversifyByDifficulty<T extends RankableQuest>(quests: T[]): T[] {
  return roundRobinBy(quests, (q) => q.difficulty);
}

// The same round-robin keyed on category instead. This is what /explore
// actually uses: the catalog is stored id-ordered and the ids are grouped
// by category prefix, so without this the first screen was 20 consecutive
// admin_life rows — the single most visible reason the index read as
// monotonous regardless of how the individual entries were written.
// Spreading categories is a bigger legibility win here than spreading
// difficulty, and it largely subsumes it in practice: consecutive rows now
// come from different categories, which have different difficulty mixes.
// diversifyByDifficulty stays exported and tested for callers that want
// the original guarantee.
export function diversifyByCategory<T extends RankableQuest>(quests: T[]): T[] {
  return roundRobinBy(quests, (q) => q.category ?? "");
}
