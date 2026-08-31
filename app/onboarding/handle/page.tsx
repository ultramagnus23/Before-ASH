import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PROFILE_COOKIE_MAX_AGE } from "@/lib/auth/complete-session";
import { ClaimHandleForm } from "./claim-handle-form";

// Server-side profile check, not just middleware's bwa_has_profile cookie
// hint — that cookie was previously session-only (no maxAge), so a
// returning user with a still-valid Supabase session but a browser that
// had fully closed since their last visit landed here with a profile that
// already exists. Redirecting straight through here means that's no
// longer a dead end even if the cookie is ever missing for some other
// reason in the future.
export default async function OnboardingHandlePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) {
    const cookieStore = await cookies();
    cookieStore.set("bwa_has_profile", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: PROFILE_COOKIE_MAX_AGE,
    });
    redirect("/list");
  }

  return (
    <main className="cover-shell guilloche relative min-h-screen flex items-center justify-center px-4">
      <ClaimHandleForm />
    </main>
  );
}
