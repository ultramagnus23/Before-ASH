import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS = 7;
const STANDING_CAP = 10;

export function isAnonymousReviewEnabled(): boolean {
  return process.env.ANON_REVIEW_ENABLED === "true";
}

export type AnonymousEligibility = { eligible: true } | { eligible: false; reason: string };

// §14a: account >=7 days old AND >=1 completed NAMED (public) item.
// Runs on the request-scoped client — this only ever reads the current
// user's own data, which RLS already allows.
export async function checkAnonymousEligibility(userId: string): Promise<AnonymousEligibility> {
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  if (!profile) return { eligible: false, reason: "Profile not found." };

  const accountAgeDays = (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS) {
    return { eligible: false, reason: `Anonymous posting unlocks after your account is ${ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS} days old.` };
  }

  const { count } = await supabase
    .from("list_items")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("visibility", "public")
    .not("completed_at", "is", null);

  if (!count || count < 1) {
    return { eligible: false, reason: "Stamp at least one named (public) item first." };
  }

  return { eligible: true };
}

// §14c: standing cap of 10 pending anonymous items SITEWIDE. This has to
// run via the service role — a regular user's RLS-scoped session can only
// ever see their own items and already-approved public/anonymous ones, so
// it structurally cannot compute a true sitewide pending count. Bypassing
// RLS here is intentional and narrow: this function returns a boolean and
// a count, never row contents.
export async function isAnonymousPaused(): Promise<{ paused: boolean; pendingCount: number }> {
  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("list_items")
    .select("id", { count: "exact", head: true })
    .eq("visibility", "anonymous")
    .eq("review_state", "pending_human");

  const pendingCount = count ?? 0;
  return { paused: pendingCount >= STANDING_CAP, pendingCount };
}
