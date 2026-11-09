import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/*
 * Uptime endpoint for an external monitor (UptimeRobot, BetterStack, etc.):
 * 200 when the app can reach its database, 503 when not. Information-free
 * by design — no versions, hosts, or counts. Inference health is separate at
 * /api/health/inference.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const { error } = await createServiceRoleClient().from("quests").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, db: "up", latencyMs: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
