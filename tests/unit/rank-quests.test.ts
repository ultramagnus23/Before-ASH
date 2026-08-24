import { describe, it, expect } from "vitest";
import { rankQuests, diversifyByDifficulty, type RankableQuest } from "@/lib/ranking/rank-quests";

describe("rankQuests", () => {
  it("ranks a quest more people currently have open above one nobody has", () => {
    const quests: RankableQuest[] = [
      { id: "a", difficulty: 1 },
      { id: "b", difficulty: 1 },
    ];
    const ranked = rankQuests(quests, {
      openCounts: new Map([["b", 12]]),
      ownedQuestIds: new Set(),
    });
    expect(ranked.map((q) => q.id)).toEqual(["b", "a"]);
  });

  it("ranks a quest not already on the viewer's list above one they've already added", () => {
    const quests: RankableQuest[] = [
      { id: "owned", difficulty: 1 },
      { id: "new", difficulty: 1 },
    ];
    const ranked = rankQuests(quests, {
      openCounts: new Map(),
      ownedQuestIds: new Set(["owned"]),
    });
    expect(ranked.map((q) => q.id)).toEqual(["new", "owned"]);
  });

  it("is stable — equal-score ties keep their input order", () => {
    const quests: RankableQuest[] = [
      { id: "a", difficulty: 1 },
      { id: "b", difficulty: 2 },
      { id: "c", difficulty: 3 },
    ];
    const ranked = rankQuests(quests, { openCounts: new Map(), ownedQuestIds: new Set() });
    expect(ranked.map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("never lets raw open-count swamp novelty entirely for a modest gap", () => {
    // A quest with a huge open count but already owned should not
    // necessarily beat an unowned quest with zero opens — log1p keeps
    // popularity from dominating novelty at realistic counts.
    const quests: RankableQuest[] = [
      { id: "popular-owned", difficulty: 1 },
      { id: "unseen", difficulty: 1 },
    ];
    const ranked = rankQuests(quests, {
      openCounts: new Map([["popular-owned", 3]]),
      ownedQuestIds: new Set(["popular-owned"]),
    });
    expect(ranked.map((q) => q.id)).toEqual(["unseen", "popular-owned"]);
  });
});

describe("diversifyByDifficulty", () => {
  it("never places two same-difficulty items consecutively when a mix is available", () => {
    const quests: RankableQuest[] = [
      { id: "a1", difficulty: 1 },
      { id: "a2", difficulty: 1 },
      { id: "a3", difficulty: 1 },
      { id: "b1", difficulty: 2 },
      { id: "b2", difficulty: 2 },
      { id: "c1", difficulty: 3 },
    ];
    const result = diversifyByDifficulty(quests);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.difficulty).not.toBe(result[i - 1]!.difficulty);
    }
  });

  it("preserves each bucket's internal (already-ranked) order", () => {
    const quests: RankableQuest[] = [
      { id: "a-first", difficulty: 1 },
      { id: "b-first", difficulty: 2 },
      { id: "a-second", difficulty: 1 },
      { id: "b-second", difficulty: 2 },
    ];
    const result = diversifyByDifficulty(quests);
    const difficulty1Order = result.filter((q) => q.difficulty === 1).map((q) => q.id);
    const difficulty2Order = result.filter((q) => q.difficulty === 2).map((q) => q.id);
    expect(difficulty1Order).toEqual(["a-first", "a-second"]);
    expect(difficulty2Order).toEqual(["b-first", "b-second"]);
  });

  it("keeps every input item exactly once", () => {
    const quests: RankableQuest[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`,
      difficulty: (i % 3) + 1,
    }));
    const result = diversifyByDifficulty(quests);
    expect(result).toHaveLength(quests.length);
    expect(new Set(result.map((q) => q.id)).size).toBe(quests.length);
  });

  it("falls back to consecutive same-difficulty runs only when unavoidable", () => {
    // 5 of one difficulty, 1 of another — the dominant bucket must repeat
    // at the tail once the minority bucket is exhausted, and that's correct.
    const quests: RankableQuest[] = [
      { id: "a1", difficulty: 1 },
      { id: "a2", difficulty: 1 },
      { id: "a3", difficulty: 1 },
      { id: "a4", difficulty: 1 },
      { id: "a5", difficulty: 1 },
      { id: "b1", difficulty: 2 },
    ];
    const result = diversifyByDifficulty(quests);
    expect(result).toHaveLength(6);
    expect(result[0]!.difficulty).toBe(1);
    expect(result[1]!.difficulty).toBe(2);
    // From here on only difficulty-1 items remain — a run is unavoidable.
    expect(result.slice(2).every((q) => q.difficulty === 1)).toBe(true);
  });
});
