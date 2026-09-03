import "server-only";
import { Redis } from "@upstash/redis";
import { getProvider, providerId } from "./provider";
import type { ProviderHealth } from "./providers/types";

/*
 * Task 0: "Add a health check that fails loudly and visibly when the
 * endpoint is unreachable. Silent degradation is a bug."
 *
 * The bug this exists to prevent already happened: /explore's semantic
 * search has been falling back to keyword matching in production since
 * deploy, because LLM_API_URL pointed at localhost. Nothing logged, nothing
 * surfaced, and the page kept telling users "search finds meaning". Nobody
 * found out until someone measured it by hand.
 *
 * So a fallback is no longer allowed to be quiet. Any code path that
 * degrades because inference failed must call reportDegraded(), which does
 * two things: logs a structured warning, and records a short-lived flag that
 * /api/health/inference and the admin dashboard can read.
 */

export type DegradedState = {
  degraded: boolean;
  /** Which subsystem degraded, e.g. "search" | "moderation". */
  surface?: string;
  /** Short reason. Never contains user content. */
  reason?: string;
  at?: string;
};

const KEY = "ai:degraded";
// Long enough that an operator checking the dashboard after a report still
// sees it; short enough that a transient blip clears itself rather than
// leaving a permanently scary banner.
const TTL_SECONDS = 900;

// Mirrors lib/rate-limit.ts's lazy construction for the same reason:
// Redis.fromEnv() throws synchronously at module load when Upstash is
// unconfigured, which would take down every importer. Health reporting must
// never be the thing that breaks a request.
let redis: Redis | undefined;
let redisUnavailable = false;

function getRedis(): Redis | undefined {
  if (redis || redisUnavailable) return redis;
  // Check the env BEFORE constructing: Redis.fromEnv() doesn't throw when
  // unconfigured, it constructs a client that logs a wall of warnings on
  // every command instead. Without this guard, local dev and CI drown in
  // Upstash noise from a health reporter that is meant to be invisible.
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisUnavailable = true;
    return undefined;
  }
  try {
    redis = Redis.fromEnv({ retry: false });
  } catch {
    redisUnavailable = true;
  }
  return redis;
}

// Fallback when Upstash isn't configured (local dev, CI). Process-local and
// therefore useless across serverless invocations — which is exactly why
// Redis is preferred — but it keeps the local signal working.
let localFlag: DegradedState = { degraded: false };

/**
 * Record that something degraded because inference was unavailable.
 * Always safe to call: never throws, never blocks the caller's own failure
 * handling.
 */
export async function reportDegraded(surface: string, reason: string): Promise<void> {
  const state: DegradedState = {
    degraded: true,
    surface,
    reason: reason.slice(0, 200),
    at: new Date().toISOString(),
  };

  // Loud half. Structured so it can be alerted on, and carries no user text.
  console.warn(
    JSON.stringify({ event: "ai_degraded", surface, reason: state.reason, at: state.at })
  );

  localFlag = state;
  try {
    await getRedis()?.set(KEY, JSON.stringify(state), { ex: TTL_SECONDS });
  } catch {
    // Reporting a failure must not itself fail the request.
  }
}

export async function getDegradedState(): Promise<DegradedState> {
  try {
    const raw = await getRedis()?.get<string | DegradedState>(KEY);
    if (raw) return typeof raw === "string" ? (JSON.parse(raw) as DegradedState) : raw;
  } catch {
    // fall through to the process-local value
  }
  return localFlag;
}

export async function clearDegraded(): Promise<void> {
  localFlag = { degraded: false };
  try {
    await getRedis()?.del(KEY);
  } catch {
    // no-op
  }
}

export type InferenceHealth = ProviderHealth & {
  aiEnabled: boolean;
  configured: boolean;
  degraded: DegradedState;
};

/**
 * Full health picture for /api/health/inference. Distinguishes the three
 * states that look identical from the outside but need different fixes:
 * AI switched off deliberately, config missing, and endpoint unreachable.
 */
export async function checkInferenceHealth(): Promise<InferenceHealth> {
  const aiEnabled = process.env.AI_ENABLED === "true";
  const configured = Boolean(
    process.env.LLM_API_URL?.trim() &&
      process.env.LLM_MODEL_NAME?.trim() &&
      process.env.LLM_EMBEDDING_MODEL_NAME?.trim()
  );
  const degraded = await getDegradedState();

  if (!aiEnabled) {
    return {
      ok: false, provider: providerId(), via: "none", latencyMs: 0,
      error: "AI_ENABLED is not 'true'.", aiEnabled, configured, degraded,
    };
  }
  if (!configured) {
    return {
      ok: false, provider: providerId(), via: "none", latencyMs: 0,
      error: "LLM_API_URL, LLM_MODEL_NAME or LLM_EMBEDDING_MODEL_NAME is unset.",
      aiEnabled, configured, degraded,
    };
  }

  const result = await getProvider().health();
  if (!result.ok) {
    await reportDegraded("health-check", result.error ?? "unreachable");
  }
  return { ...result, aiEnabled, configured, degraded: await getDegradedState() };
}
