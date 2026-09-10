import { describe, it, expect } from "vitest";
import { selectTonight, campusNow, bucketFor, type TonightCandidate } from "@/lib/tonight/select";

function make(n: number, over: Partial<TonightCandidate> = {}): TonightCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    slug: `q${i}`,
    title: `Item ${i}`,
    category: "campus_ritual",
    timeOfDay: ["evening"],
    dayOfWeek: ["weekday"],
    ...over,
  }));
}

// 2026-09-10 is a Thursday. 14:30 UTC is 20:00 in Kolkata -- evening, weekday.
const THURSDAY_EVENING = new Date("2026-09-10T14:30:00Z");

describe("campusNow", () => {
  it("reads the hour in campus time, not the server's", () => {
    // Vercel runs UTC. Without the timezone conversion this is 14:00 --
    // afternoon -- and the whole campus gets breakfast items at 8pm.
    expect(campusNow(THURSDAY_EVENING).hour).toBe(20);
  });

  it("classifies Saturday and Sunday as weekend", () => {
    expect(campusNow(new Date("2026-09-12T06:00:00Z")).day).toBe("weekend");
    expect(campusNow(new Date("2026-09-13T06:00:00Z")).day).toBe("weekend");
    expect(campusNow(THURSDAY_EVENING).day).toBe("weekday");
  });

  it("rolls the campus date over before UTC does", () => {
    // 19:00 UTC on the 10th is already 00:30 on the 11th in Kolkata.
    expect(campusNow(new Date("2026-09-10T19:00:00Z")).date).toBe("2026-09-11");
  });
});

describe("bucketFor", () => {
  it("covers all 24 hours with no gap", () => {
    const seen = new Set(Array.from({ length: 24 }, (_, h) => bucketFor(h)));
    expect(seen).toEqual(new Set(["morning", "afternoon", "evening", "late_night"]));
  });

  it("puts the small hours in late_night", () => {
    expect(bucketFor(2)).toBe("late_night");
    expect(bucketFor(23)).toBe("late_night");
  });
});

describe("selectTonight", () => {
  const opts = { userId: "user-a", at: THURSDAY_EVENING };

  it("returns between four and six items", () => {
    const picked = selectTonight(make(40), opts);
    expect(picked.length).toBeGreaterThanOrEqual(4);
    expect(picked.length).toBeLessThanOrEqual(6);
  });

  it("is stable for the same person on the same day", () => {
    const a = selectTonight(make(40), opts);
    const b = selectTonight(make(40), opts);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it("differs the next day", () => {
    const today = selectTonight(make(40), opts);
    const tomorrow = selectTonight(make(40), { ...opts, at: new Date("2026-09-11T14:30:00Z") });
    expect(today.map((i) => i.id)).not.toEqual(tomorrow.map((i) => i.id));
  });

  it("differs between two people on the same evening", () => {
    const a = selectTonight(make(40), opts);
    const b = selectTonight(make(40), { ...opts, userId: "user-b" });
    expect(a.map((i) => i.id)).not.toEqual(b.map((i) => i.id));
  });

  it("turns over as the day does, not only at midnight", () => {
    const evening = selectTonight(make(40), opts);
    // 05:00 UTC the same campus day is 10:30 -- morning.
    const morning = selectTonight(make(40, { timeOfDay: ["morning", "evening"] }), {
      ...opts,
      at: new Date("2026-09-10T05:00:00Z"),
    });
    expect(evening.map((i) => i.id)).not.toEqual(morning.map((i) => i.id));
  });

  it("prefers items matching both the hour and the kind of day", () => {
    const pool = [
      ...make(6, { timeOfDay: ["evening"], dayOfWeek: ["weekday"] }),
      ...make(6, { timeOfDay: ["morning"], dayOfWeek: ["weekend"] }).map((c) => ({ ...c, id: `x${c.id}` })),
    ];
    const picked = selectTonight(pool, opts);
    expect(picked.every((p) => p.timeOfDay.includes("evening"))).toBe(true);
  });

  it("widens rather than returning a short list", () => {
    // Only two items match the hour, which is below the four-item floor.
    const pool = [
      ...make(2, { timeOfDay: ["evening"], dayOfWeek: ["weekday"] }),
      ...make(10, { timeOfDay: ["morning"], dayOfWeek: ["weekday"] }).map((c) => ({ ...c, id: `x${c.id}` })),
    ];
    expect(selectTonight(pool, opts).length).toBeGreaterThanOrEqual(4);
  });

  it("still returns items when nothing has been reviewed yet", () => {
    // The state the catalog is in right now: proposals everywhere, zero
    // reviewed rows, so every candidate arrives with empty tags. An empty
    // Tonight would look broken rather than unreviewed.
    const untagged = make(20, { timeOfDay: [], dayOfWeek: [] });
    expect(selectTonight(untagged, opts).length).toBeGreaterThanOrEqual(4);
  });

  it("never throws on an empty catalog", () => {
    expect(selectTonight([], opts)).toEqual([]);
  });

  it("returns everything it has when the catalog is smaller than the floor", () => {
    expect(selectTonight(make(2), opts)).toHaveLength(2);
  });
});
