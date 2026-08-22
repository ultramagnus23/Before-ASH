import { createClient } from "@/lib/supabase/server";
import { MFA_VERIFIED_COOKIE } from "@/lib/admin/guard";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Called immediately after a successful mfa.verify() from the client, on
// both the enrollment and the regular verify pages. Sets the freshness
// cookie lib/admin/guard.ts checks — this is what makes "re-verified if
// the MFA check is older than a few hours" (BUILD-PROMPT.md #17) real,
// since Supabase's own aal2 status doesn't expire on a timer by itself.
export async function POST() {
  const supabase = await createClient();
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel !== "aal2") {
    return NextResponse.json({ error: "Session is not aal2." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(MFA_VERIFIED_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/admin",
  });

  return NextResponse.json({ ok: true });
}
