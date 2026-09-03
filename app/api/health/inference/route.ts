import { checkInferenceHealth } from "@/lib/ai/health";
import { NextResponse } from "next/server";

/*
 * Task 0: the endpoint that makes "is moderation actually working in
 * production?" a question you can answer in one request instead of by
 * measuring search results by hand.
 *
 * Deliberately unauthenticated but information-free: it reports whether the
 * configured endpoint is reachable, never the URL, the key, the model name,
 * or any user content. Knowing "inference is down" is not sensitive; it is
 * the thing an operator most needs and currently cannot find out.
 *
 * 200 when healthy, 503 when not, so uptime checks can watch it directly.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkInferenceHealth();

  return NextResponse.json(
    {
      ok: health.ok,
      provider: health.provider,
      checkedVia: health.via,
      latencyMs: health.latencyMs,
      aiEnabled: health.aiEnabled,
      configured: health.configured,
      degraded: health.degraded,
      ...(health.error ? { error: health.error } : {}),
    },
    { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
