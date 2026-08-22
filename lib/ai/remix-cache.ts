import "server-only";
import { createHash } from "node:crypto";
import { getRedis } from "@/lib/rate-limit";

/*
 * §"AI cost controls" / P7: remix results are cached for 24h, SHARED across
 * all users — not per-user — keyed only on (text, intensity). Two different
 * people remixing the same catalog quest at the same intensity get the
 * same cached variants instead of paying for two identical model calls.
 * The cache key is a hash of the input text, never a user id or item id —
 * consistent with callModel's own minimal-payload rule, even though this
 * cache lives one layer above callModel itself.
 *
 * A missing/broken Upstash config must degrade to "no cache" here, not
 * crash remix — same fail-open reasoning as checkRateLimit in
 * lib/rate-limit.ts, and getRedis() is lazy for the same reason
 * getLimiters() is: it must not throw at import time.
 */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(text: string, intensity: number): string {
  const hash = createHash("sha256").update(`${intensity}:${text}`).digest("hex");
  return `remix-cache:${hash}`;
}

export async function getCachedRemix(text: string, intensity: number): Promise<string[] | null> {
  try {
    const cached = await getRedis().get<string[]>(cacheKey(text, intensity));
    return cached ?? null;
  } catch (err) {
    console.error("Remix cache read failed, skipping cache:", err);
    return null;
  }
}

export async function setCachedRemix(text: string, intensity: number, variants: string[]): Promise<void> {
  try {
    await getRedis().set(cacheKey(text, intensity), variants, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error("Remix cache write failed, skipping cache:", err);
  }
}
