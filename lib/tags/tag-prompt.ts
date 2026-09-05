import {
  DIMENSIONS,
  RUBRIC,
  TIME_OF_DAY,
  DAY_OF_WEEK,
  DURATION,
  SETTING,
  COST_BAND,
  SEASON,
  GROUP_SIZE,
  type QuestTags,
  type TagConfidence,
  type Dimension,
} from "./dimensions";

/*
 * The catalog pre-tagging prompt and the hardening around its response.
 *
 * Deliberately NOT under `server-only`: two callers need this and they run
 * in different worlds. lib/ai/call-model.ts wraps it for the app;
 * scripts/pretag-catalog.ts runs it from the command line, where a
 * `server-only` import throws outright. Everything model-specific stays in
 * those callers -- this file has no transport in it, so there is no wire
 * format here to drift.
 */

const ALLOWED: Record<Dimension, readonly string[]> = {
  time_of_day: TIME_OF_DAY,
  day_of_week: DAY_OF_WEEK,
  duration: DURATION,
  setting: SETTING,
  cost_band: COST_BAND,
  season: SEASON,
  group_size: GROUP_SIZE,
};

const MULTI = new Set<Dimension>(["time_of_day", "day_of_week"]);

/*
 * The model is asked about six dimensions, not seven.
 *
 * solo/group already exists on quests.group_size as curated seed data, and
 * the sample run made the case for leaving it alone: asked to re-derive it,
 * a 7B model answered "solo" for eleven of twelve items including "crash a
 * club's first meeting". Replacing hand-curated values with that is strictly
 * worse than carrying them through. The caller supplies the existing value
 * and it arrives at review at full confidence, where the curator can still
 * change it like any other dimension.
 */
export const MODEL_DIMENSIONS = DIMENSIONS.filter((d) => d !== "group_size");

/*
 * How much a proposal actually needs a human, which is NOT the same as what
 * the model says about itself.
 *
 * Self-reported confidence from a 7B model came back as a flat 0.5 on
 * eleven of twelve sample items -- as an ordering key that is no ordering at
 * all. So the score also counts hedging, which is observable rather than
 * self-reported: an item that claims all four times of day has not answered
 * the question, whatever number it attaches. Both signals are kept because
 * they fail differently -- self-report catches "I do not know what this is",
 * breadth catches "I answered everything to avoid choosing".
 */
export function scoreProposal(tags: QuestTags, confidence: TagConfidence): number {
  const reported = Math.min(...MODEL_DIMENSIONS.map((d) => confidence[d] ?? 0));
  const breadth =
    tags.time_of_day.length / TIME_OF_DAY.length + tags.day_of_week.length / DAY_OF_WEEK.length;
  // breadth is 2 when everything is selected, ~0.75 at its most decisive.
  const hedge = Math.max(0, (breadth - 0.75) / 1.25);
  return Math.max(0, Math.min(1, reported * (1 - 0.6 * hedge)));
}

// A 7B model returns plausible-looking garbage often enough that trusting
// the shape is not an option: a value outside the vocabulary, a bare string
// where an array belongs, a confidence of "high". Everything below is
// coerced or dropped, and a dimension that cannot be salvaged comes back at
// confidence 0 with a safe default — which sorts it to the top of the
// review queue, exactly where an unusable guess belongs.
export function coerceTags(raw: unknown, groupSize: QuestTags["group_size"] = "any"): { tags: QuestTags; confidence: TagConfidence } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawTags = (obj.tags ?? obj) as Record<string, unknown>;
  const rawConf = (obj.confidence ?? {}) as Record<string, unknown>;

  const confidence: TagConfidence = {};
  const out: Record<string, unknown> = {};

  for (const dim of MODEL_DIMENSIONS) {
    const allowed = ALLOWED[dim];
    const value = rawTags[dim];
    let ok = false;

    if (MULTI.has(dim)) {
      // The model answers these with ONE value; anything else it also
      // considers acceptable comes separately under `<dim>_also`. Asking for
      // a free multi-select produced all-four on 205 of 491 items, and
      // adding "never choose all four" to the rubric made that 20 of 20 --
      // negation does not steer a 7B model. So the response format does the
      // steering instead: there is no field it can put four answers in.
      // Accepts a bare string OR an array, because the model reliably
      // answers `["evening"]` when asked for one value -- a committed answer
      // in a wrapper, not a hedge. Rejecting the wrapper (an earlier version
      // of this function did) sent every item down the fallback path and
      // looked exactly like the model refusing to choose.
      //
      // Order carries meaning: the first valid value is the primary, the
      // rest are alternates, and `<dim>_also` appends to them. Nothing here
      // caps the count -- an item that really does span the day should say
      // so, and scoreProposal() is what pushes an indiscriminate answer up
      // the review queue.
      const listed = (Array.isArray(value) ? value : [value])
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => allowed.includes(v));
      const primary = listed[0] ?? "";
      ok = allowed.includes(primary);
      const extras = [
        ...listed.slice(1),
        ...(Array.isArray(rawTags[dim + "_also"]) ? (rawTags[dim + "_also"] as unknown[]) : [])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().toLowerCase())
          .filter((v) => allowed.includes(v)),
      ].filter((v) => v !== primary);
      // Never an empty array: the column forbids it, and an item with no
      // time-of-day silently vanishes from Tonight rather than erroring. The
      // _also values are dropped with it, because promoting a secondary
      // guess to the headline answer would read as confident when it is not.
      out[dim] = ok ? [...new Set([primary, ...extras])] : [...allowed];
    } else {
      const v = typeof value === "string" ? value.trim().toLowerCase() : "";
      ok = allowed.includes(v);
      out[dim] = ok ? v : allowed[allowed.length - 1];
    }

    const c = Number(rawConf[dim]);
    confidence[dim] = ok && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
  }

  // Carried through, not inferred -- see MODEL_DIMENSIONS above.
  out.group_size = groupSize;
  confidence.group_size = 1;

  return { tags: out as unknown as QuestTags, confidence };
}

export const TAG_SYSTEM_PROMPT = [
    "You are tagging items in a campus bucket-list catalog for students at",
    "Ashoka University in Sonipat, Haryana, India. Tag the user's item on",
    "every dimension below using ONLY the listed values.",
    "",
    ...MODEL_DIMENSIONS.map((d) => `${d}: ${RUBRIC[d]}`),
    "",
    "Also report your confidence in each dimension from 0 to 1. Be honest:",
    "if the item's text does not say enough to tag a dimension, say 0.2, do",
    "not guess at 0.9. A low score sends it to a human, which is the point.",
    "",
    "Respond with ONLY a JSON object of this exact shape:",
    '{"tags":{"time_of_day":["evening"],"day_of_week":["weekday","weekend"],',
    '"duration":"under_1h","setting":"outdoor","cost_band":"free",',
    '"season":"any"},',
    '"confidence":{"time_of_day":0.8,"day_of_week":0.6,"duration":0.7,',
    '"setting":0.9,"cost_band":0.5,"season":0.9}}',
  ].join("\n");
