import type { TimeOfDay, DayOfWeek } from "@/lib/tags/dimensions";

/*
 * Tonight's selection, as pure functions.
 *
 * Everything time-dependent enters through arguments -- the clock, the
 * viewer, the candidate rows -- so the interesting behaviour (same items all
 * day, different items tomorrow, never empty) is testable without a database
 * or a fake system clock.
 */

/** Ashoka is one campus in one timezone, and every user is standing on it. */
export const CAMPUS_TIMEZONE = "Asia/Kolkata";

export type TonightCandidate = {
  id: string;
  slug: string;
  title: string;
  category: string;
  /** Empty when the item has no reviewed tags yet. */
  timeOfDay: TimeOfDay[];
  dayOfWeek: DayOfWeek[];
};

/** Where the clock is now, in the terms the tags are written in. */
export function bucketFor(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late_night";
}

/**
 * The campus-local hour, weekday and calendar date.
 *
 * Derived through Intl rather than the server's own clock: Vercel runs UTC,
 * so a naive getHours() would put the whole campus five and a half hours in
 * the past and show breakfast items at midnight.
 */
export function campusNow(at: Date): { hour: number; day: DayOfWeek; date: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");

  return {
    // "24" is a legal Intl output for midnight in some environments.
    hour: Number(get("hour")) % 24,
    day: weekday === "Sat" || weekday === "Sun" ? "weekend" : "weekday",
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

// xmur3 + mulberry32. A seeded PRNG rather than Math.random() because the
// list has to be stable for a whole day and then genuinely different the
// next -- "deterministic within a day, different across days" is a property
// of the seed, not something to re-roll on every render.
function seedFrom(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const MIN_ITEMS = 4;
const MAX_ITEMS = 6;

/*
 * The widening ladder.
 *
 * "Infinite recycle -- never a dead end" means an empty Tonight is a bug, not
 * an edge case, so the filter loosens until something comes back rather than
 * returning nothing. Each rung is a smaller claim than the one above it:
 *
 *   1. right time AND right kind of day  -- what the feature actually promises
 *   2. right time, any day               -- most items carry both weekday and
 *                                           weekend, so this rarely fires
 *   3. reviewed at all                   -- tags exist but none match the hour
 *   4. anything in the catalog           -- no reviewed tags yet at all
 *
 * Rung 4 is not hypothetical: the catalog is fully proposed and not yet
 * reviewed, so today it is the only rung that returns anything. Without it
 * this page would ship empty and look broken rather than unreviewed.
 */
export function selectTonight(
  candidates: TonightCandidate[],
  options: { userId: string; at: Date }
): TonightCandidate[] {
  const { hour, day, date } = campusNow(options.at);
  const bucket = bucketFor(hour);

  const tagged = candidates.filter((c) => c.timeOfDay.length > 0);
  const rungs: TonightCandidate[][] = [
    tagged.filter((c) => c.timeOfDay.includes(bucket) && c.dayOfWeek.includes(day)),
    tagged.filter((c) => c.timeOfDay.includes(bucket)),
    tagged,
    candidates,
  ];

  const pool = rungs.find((rung) => rung.length >= MIN_ITEMS) ?? rungs[rungs.length - 1] ?? [];

  // The seed is per-user and per-day. Two people on the same evening see
  // different lists; the same person refreshing all evening sees the same
  // one; tomorrow is a different draw. The bucket is in the seed too, so the
  // list turns over as the day does rather than only at midnight.
  const rand = seedFrom(`${options.userId}:${date}:${bucket}`);
  const count = MIN_ITEMS + Math.floor(rand() * (MAX_ITEMS - MIN_ITEMS + 1));
  return shuffled(pool, rand).slice(0, count);
}
