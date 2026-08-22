import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    response.cookies.set("bwa_has_profile", "1", { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return response;
}
