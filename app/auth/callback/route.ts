import { createClient } from "@/lib/supabase/server";
import { completeSessionAndRedirect } from "@/lib/auth/complete-session";
import { NextResponse, type NextRequest } from "next/server";

// PKCE code-exchange flow — what a real user's magic-link click produces
// when @supabase/ssr's client (which defaults to flowType: 'pkce')
// initiated the sign-in via signInWithOtp(). See app/auth/confirm/route.ts
// for the OTP token_hash flow, which is what admin.generateLink() produces
// in tests (it doesn't participate in PKCE) — confirmed by actually
// tracing the redirect chain against a live project, not assumed.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const policyVersion = searchParams.get("policy_version") ?? "unversioned";

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  return completeSessionAndRedirect(supabase, data.user.id, origin, policyVersion);
}
