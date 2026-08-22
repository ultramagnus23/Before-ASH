import { createClient } from "@/lib/supabase/server";
import { completeSessionAndRedirect } from "@/lib/auth/complete-session";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/*
 * OTP token_hash flow — Supabase's magic-link/signup/recovery emails
 * verify via a `token_hash` + `type` pair, not the OAuth-style `code` that
 * app/auth/callback/route.ts handles. This is also the correct target for
 * a CUSTOMIZED Supabase email template using {{ .TokenHash }} directly
 * (Authentication -> Email Templates -> Magic Link) instead of the default
 * {{ .ConfirmationURL }}, which routes through Supabase's own /auth/v1/verify
 * and redirects with tokens in a URL FRAGMENT (#access_token=...) that a
 * server route can never see — fragments aren't sent in HTTP requests.
 * verifyOtp() here sidesteps that hop entirely by validating the hash
 * directly, server-side.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const policyVersion = searchParams.get("policy_version") ?? "unversioned";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/?error=missing_token`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  return completeSessionAndRedirect(supabase, data.user.id, origin, policyVersion);
}
