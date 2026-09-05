import { describe, it, expect } from "vitest";
import { coerceTags, scoreProposal, MODEL_DIMENSIONS } from "@/lib/tags/tag-prompt";
import { TIME_OF_DAY, DAY_OF_WEEK } from "@/lib/tags/dimensions";

/*
 * These tests exist because the tagging pass runs unattended over 491 items
 * against a 7B model. Every case below is a shape that model actually
 * produced or plausibly will; the contract is that none of them can put a
 * malformed row into quest_tags or a silent hole into Tonight.
 */

const GOOD = {
  tags: {
    time_of_day: ["evening"],
    day_of_week: ["weekday"],
    duration: "under_1h",
    setting: "outdoor",
    cost_band: "free",
    season: "any",
  },
  confidence: { time_of_day: 0.9, day_of_week: 0.8, duration: 0.7, setting: 0.9, cost_band: 0.8, season: 0.9 },
};

describe("coerceTags", () => {
  it("passes a well-formed response through", () => {
    const { tags } = coerceTags(GOOD);
    expect(tags.time_of_day).toEqual(["evening"]);
    expect(tags.duration).toBe("under_1h");
  });

  it("never returns an empty multi-valued array", () => {
    // An empty array violates a check constraint AND would drop the item out
    // of every Tonight query without erroring, which is the worse half.
    const { tags } = coerceTags({ tags: { ...GOOD.tags, time_of_day: [] } });
    expect(tags.time_of_day.length).toBeGreaterThan(0);
  });

  it("drops values outside the vocabulary", () => {
    const { tags } = coerceTags({ tags: { ...GOOD.tags, time_of_day: ["evening", "dawn", "brunch"] } });
    expect(tags.time_of_day).toEqual(["evening"]);
  });

  it("accepts a bare string where an array belongs", () => {
    const { tags } = coerceTags({ tags: { ...GOOD.tags, day_of_week: "weekend" } });
    expect(tags.day_of_week).toEqual(["weekend"]);
  });

  it("scores an unusable dimension at zero confidence rather than failing", () => {
    const { tags, confidence } = coerceTags({ tags: { ...GOOD.tags, duration: "about an hour" } });
    expect(confidence.duration).toBe(0);
    // Still a legal value, so the row can be written and reviewed.
    expect(["under_1h", "half_day", "full_day", "multi_day"]).toContain(tags.duration);
  });

  it("survives a response that is not an object at all", () => {
    const { tags } = coerceTags(null);
    expect(tags.time_of_day.length).toBeGreaterThan(0);
    expect(tags.season).toBeDefined();
  });

  it("carries group_size through instead of inferring it", () => {
    const { tags, confidence } = coerceTags({ tags: { ...GOOD.tags, group_size: "solo" } }, "group");
    expect(tags.group_size).toBe("group");
    expect(confidence.group_size).toBe(1);
  });

  it("does not ask the model about group_size", () => {
    expect(MODEL_DIMENSIONS).not.toContain("group_size");
    expect(MODEL_DIMENSIONS).toHaveLength(6);
  });

  it("clamps confidence into 0..1", () => {
    const { confidence } = coerceTags({ ...GOOD, confidence: { ...GOOD.confidence, setting: 7 } });
    expect(confidence.setting).toBe(1);
  });
});

describe("scoreProposal", () => {
  const tags = coerceTags(GOOD).tags;

  it("ranks a decisive proposal above a hedged one with identical self-reports", () => {
    // The failure this guards: the sample run self-reported a flat 0.5 on
    // eleven of twelve items, so ordering on self-report alone was arbitrary.
    const flat = { time_of_day: 0.5, day_of_week: 0.5, duration: 0.5, setting: 0.5, cost_band: 0.5, season: 0.5 };
    const decisive = scoreProposal(tags, flat);
    const hedged = scoreProposal(
      { ...tags, time_of_day: [...TIME_OF_DAY], day_of_week: [...DAY_OF_WEEK] },
      flat
    );
    expect(hedged).toBeLessThan(decisive);
  });

  it("stays within 0..1", () => {
    const score = scoreProposal(tags, GOOD.confidence);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("ignores group_size, which is not a model judgement", () => {
    const withZero = scoreProposal(tags, { ...GOOD.confidence, group_size: 0 });
    expect(withZero).toBe(scoreProposal(tags, GOOD.confidence));
  });
});
