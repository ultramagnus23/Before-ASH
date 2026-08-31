import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// bwa_has_profile was being set with no maxAge — a plain session cookie,
// cleared the moment the browser/app fully closes (routine on mobile: the
// browser gets backgrounded and killed by the OS constantly). The actual
// Supabase session cookie survives that (400-day default, @supabase/ssr's
// DEFAULT_COOKIE_OPTIONS), so a real returning user still had a valid
// session but no bwa_has_profile cookie — middleware.ts then wrongly
// treated them as not-yet-onboarded and bounced them to
// /onboarding/handle, which (before this fix) had no server-side check of
// its own and just re-showed the claim-a-handle form. Submitting their own
// existing handle then failed with "That handle is taken" — a dead end
// that read exactly like being logged out and unable to log back in, even
// though the actual session never expired. Matching the real session's
// lifetime here is the fix; app/onboarding/handle/page.tsx's new
// server-side profile check (see that file) is the second, independent
// layer in case this cookie is ever missing for some other reason.
export const PROFILE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/*
 * Shared by both post-auth routes (app/auth/callback and app/auth/confirm)
 * — §8.2 consent logging, checking whether onboarding is done, and the
 * resulting redirect are identical regardless of which Supabase flow
 * (PKCE code exchange vs. OTP token_hash) produced the session.
 */
export async function completeSessionAndRedirect(
  supabase: SupabaseClient,
  userId: string,
  origin: string,
  policyVersion: string
): Promise<NextResponse> {
  const { data: existing } = await supabase
    .from("policy_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("policy_version", policyVersion)
    .maybeSingle();

  if (!existing) {
    await supabase.from("policy_acceptances").insert({
      user_id: userId,
      policy_version: policyVersion,
    });
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();

  const response = NextResponse.redirect(`${origin}${profile ? "/list" : "/onboarding/handle"}`);
  if (profile) {
    response.cookies.set("bwa_has_profile", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: PROFILE_COOKIE_MAX_AGE,
    });
  }
  return response;
}
