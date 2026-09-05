/*
 * The seven tag dimensions, defined once.
 *
 * This file is the single source of truth for the vocabulary: the Postgres
 * enums in db/migrations/0015_quest_tags.sql, the rubric sent to the model,
 * the review tool's keyboard bindings, and Tonight's selection all derive
 * from it. Adding a value in one place and forgetting another is the
 * failure mode this prevents.
 *
 * No dimension is free text. Every value is a closed set, because the whole
 * point of tagging 491 items is to filter on them later.
 */

export const TIME_OF_DAY = ["morning", "afternoon", "evening", "late_night"] as const;
export const DAY_OF_WEEK = ["weekday", "weekend"] as const;
export const DURATION = ["under_1h", "half_day", "full_day", "multi_day"] as const;
export const SETTING = ["indoor", "outdoor", "either"] as const;
export const COST_BAND = ["free", "under_200", "under_1000", "over_1000"] as const;
export const SEASON = ["any", "winter", "summer", "monsoon"] as const;
export const GROUP_SIZE = ["solo", "duo", "group", "any"] as const;

export type TimeOfDay = (typeof TIME_OF_DAY)[number];
export type DayOfWeek = (typeof DAY_OF_WEEK)[number];
export type Duration = (typeof DURATION)[number];
export type Setting = (typeof SETTING)[number];
export type CostBand = (typeof COST_BAND)[number];
export type Season = (typeof SEASON)[number];
export type GroupSize = (typeof GROUP_SIZE)[number];

/** The two multi-valued dimensions; every other one holds exactly one value. */
export type QuestTags = {
  time_of_day: TimeOfDay[];
  day_of_week: DayOfWeek[];
  duration: Duration;
  setting: Setting;
  cost_band: CostBand;
  season: Season;
  group_size: GroupSize;
};

export const DIMENSIONS = [
  "time_of_day",
  "day_of_week",
  "duration",
  "setting",
  "cost_band",
  "season",
  "group_size",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Per-dimension 0..1, as reported by the tagging pass. */
export type TagConfidence = Partial<Record<Dimension, number>>;

/*
 * The rubric. This text goes to the model verbatim and is also what the
 * human reviewer is holding themselves to — one definition, so a reviewer
 * correcting the model isn't applying a different standard than the model
 * was given. Written for Ashoka/Sonipat specifically; a generic rubric
 * produced generic tags in testing ("evening" for nearly everything).
 */
export const RUBRIC: Record<Dimension, string> = {
  time_of_day:
    "The ONE time a student would most naturally do this: morning (6-12), " +
    "afternoon (12-17), evening (17-22), or late_night (22-6). Answer with the " +
    "single best one. Use late_night only for things that depend on everything " +
    "else being shut.",
  day_of_week:
    "The ONE better day for this: weekday or weekend. Answer weekend if it needs " +
    "a free day, travel out of Sonipat, or more than about four hours. Answer " +
    "weekday if it depends on classes, offices, faculty, clubs, or the campus " +
    "actually running. Pick the better one even when both would work.",
  duration:
    "How long one attempt takes, door to door, including travel. One of: " +
    "under_1h, half_day (1-4h), full_day (4-8h), multi_day (overnight or more).",
  setting:
    "One of: indoor, outdoor, either. Use 'either' only when it genuinely works " +
    "both ways, not as a way of avoiding the choice.",
  cost_band:
    "Rupees per person for one attempt, INCLUDING travel. One of: free, " +
    "under_200, under_1000, over_1000. 'free' means genuinely zero rupees -- " +
    "walkable, on campus, nothing bought. Anything leaving Sonipat costs at " +
    "least under_1000 in transport alone. Anything involving food or a ticket " +
    "is not free.",
  season:
    "One of: any, winter, summer, monsoon. Use 'any' unless the Sonipat weather " +
    "genuinely rules the other seasons out — most items are 'any'.",
  group_size:
    "Who this needs. One of: solo, duo, group, any. Use 'any' when it works alone " +
    "or together; use 'solo' only when company would defeat the point.",
};
