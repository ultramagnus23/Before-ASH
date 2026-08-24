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
} as const;

function scoreQuest(quest: RankableQuest, ctx: RankingContext): number {
  const openCount = ctx.openCounts.get(quest.id) ?? 0;
  const novelty = ctx.ownedQuestIds.has(quest.id) ? 0 : 1;
  return WEIGHTS.openCount * Math.log1p(openCount) + WEIGHTS.novelty * novelty;
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
export function diversifyByDifficulty<T extends RankableQuest>(quests: T[]): T[] {
  const buckets = new Map<number, T[]>();
  for (const quest of quests) {
    const bucket = buckets.get(quest.difficulty);
    if (bucket) bucket.push(quest);
    else buckets.set(quest.difficulty, [quest]);
  }
  const bucketKeys = [...buckets.keys()];

  const result: T[] = [];
  let remaining = quests.length;
  while (remaining > 0) {
    for (const key of bucketKeys) {
      const bucket = buckets.get(key)!;
      const next = bucket.shift();
      if (next !== undefined) {
        result.push(next);
        remaining--;
      }
    }
  }
  return result;
}
