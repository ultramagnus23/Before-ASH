import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/*
 * Deliberately NOT applied to add-to-list or mark-done — those two are the
 * paths that may never break (BUILD-PROMPT.md #20), and a rate limiter is
 * one more thing that can misconfigure, time out, or fail in a way that
 * takes down the one interaction the whole product is built around. Every
 * other mutating route goes through one of the limiters below.
 *
 * This module requires UPSTASH_REDIS_REST_URL/TOKEN to be set wherever
 * it's imported — that's standard for a server-only module reading its own
 * config, not a lazy-init trick. Only files that actually call
 * checkRateLimit() import this; it is never imported from client
 * components or from files that must load without Upstash configured.
 */
// Lazy: constructing Redis.fromEnv() at module load throws SYNCHRONOUSLY the
// moment this file is imported if UPSTASH_REDIS_REST_URL/TOKEN are blank —
// which happens before checkRateLimit's own try/catch below ever runs; a
// dynamic `await import("@/lib/rate-limit")` call site has no way to catch
// it either, since the throw is part of module evaluation, not the call.
// That took down addCustomItem outright with Upstash unconfigured, found
// live via the mark-done e2e test. Deferring both the client and the
// limiter map to first use means the throw happens inside the try/catch
// that's actually meant to handle it.
let redis: Redis | undefined;
let limiters: Record<RateLimitNameInternal, Ratelimit> | undefined;

function getLimiters() {
  if (limiters) return limiters;
  redis = Redis.fromEnv();
  limiters = {
    // §7.1: max 5 reports filed per user per day, across all content.
    reportsPerDay: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      prefix: "ratelimit:reports",
    }),
    // §6/#14b: 1 anonymous submission per user per WEEK, not per day.
    anonymousPerWeek: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, "7 d"),
      prefix: "ratelimit:anonymous",
    }),
    // A generous ceiling against spam custom-item creation — not spec'd
    // explicitly, but "rate limits on every mutating route" (P6) covers it,
    // and this is loose enough to never bother a real user.
    customItemsPerHour: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "ratelimit:custom-items",
    }),
    // Same reasoning as customItemsPerHour, applied to connection requests so
    // "I'm in" can't be used to mass-harass people with request spam.
    connectionsPerHour: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      prefix: "ratelimit:connections",
    }),
    // P7 §"AI cost controls": remix quota, 5 per user per day.
    remixPerDay: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      prefix: "ratelimit:remix",
    }),
    // §13.2: smart-paste segmentation is an LLM call per attempt — capped
    // generously so someone iterating on a big paste isn't blocked, but a
    // script can't hammer it.
    segmentPerHour: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "ratelimit:segment",
    }),
    // Bulk-import commits (both smart-paste and CSV/Excel) — generous, same
    // reasoning as customItemsPerHour.
    bulkImportPerHour: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "ratelimit:bulk-import",
    }),
  };
  return limiters;
}

// Exported so lib/ai/remix-cache.ts can share the same Redis connection
// instead of opening a second one — it's not a rate limiter, just a
// key-value cache, but the client construction/env-var story is identical.
// Lazy for the same reason as getLimiters(): must not throw at import time.
export function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

type RateLimitNameInternal =
  | "reportsPerDay"
  | "anonymousPerWeek"
  | "customItemsPerHour"
  | "connectionsPerHour"
  | "remixPerDay"
  | "segmentPerHour"
  | "bulkImportPerHour";

export type RateLimitName = RateLimitNameInternal;

// Fails OPEN, not closed, on an infrastructure error (Upstash unreachable,
// misconfigured, or — as found live — UPSTASH_REDIS_REST_URL/TOKEN simply
// blank, which throws "Failed to parse URL" from inside .limit() the
// moment it tries to make a request). This is deliberately different from
// the moderation pipeline's fail-closed posture: a missing rate limiter is
// an availability problem, not a safety one, and letting it crash
// addCustomItem — a feature explicitly speced as "first-class, never
// secondary" — because an unrelated ops dependency is down is a worse
// outcome than temporarily running that one route unprotected. Found by
// actually exercising this path in the mark-done e2e test with Upstash
// unconfigured; it took the whole request down with an uncaught exception
// before this fix existed.
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    const result = await getLimiters()[name].limit(identifier);
    if (result.success) return { allowed: true };
    const retryAfterSeconds = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  } catch (err) {
    console.error(`Rate limiter "${name}" unreachable, failing open:`, err);
    return { allowed: true };
  }
}
