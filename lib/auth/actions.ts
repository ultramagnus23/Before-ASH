"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { handleSchema, bioSchema, ASHOKA_EMAIL_ERROR } from "@/lib/validation";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PROFILE_COOKIE_MAX_AGE } from "./complete-session";
import { logEvent } from "@/lib/events/log";

const POLICY_VERSION = process.env.POLICY_VERSION ?? "unversioned";
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "ashoka.edu.in";

// Checked here, not in the Zod schema, because it needs a DB read against
// demo_access_emails (db/migrations/0010) — a real table now instead of a
// hardcoded literal, specifically so adding another pitch/demo account is
// "add a row in Supabase's Table Editor," not "edit code, redeploy." The
// signup trigger checks the same table server-side regardless, so this is
// still defense-in-depth, not the only thing standing between a random
// email and an account.
async function isAllowedEmail(email: string): Promise<boolean> {
  if (email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return true;
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("demo_access_emails").select("email").eq("email", email).maybeSingle();
  return Boolean(data);
}

export type GoogleSignInResult = { error?: string; redirectTo?: string };

// In-page Google sign-in (Google Identity Services): the browser gets an ID
// token without ever leaving the page and hands it here. Supabase verifies
// the token's signature/audience and creates the session; we then re-check the
// verified email against the allow-list. The auth.users trigger
// (0003/0010) rejects non-Ashoka emails at insert regardless, so this is the
// friendly-error layer, not the only one.
export async function signInWithGoogle(idToken: string, consented: boolean): Promise<GoogleSignInResult> {
  if (!consented) {
    return { error: "You need to accept the terms, privacy, and community rules first." };
  }
  if (!idToken) return { error: "Google sign-in failed. Try again." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });

  const email = data?.user?.email?.toLowerCase();
  if (error || !data?.user || !email) {
    // The domain trigger surfaces as a generic database error here.
    return { error: /ashoka/i.test(error?.message ?? "") ? ASHOKA_EMAIL_ERROR : "Couldn't sign you in. Use your @" + ALLOWED_EMAIL_DOMAIN + " account." };
  }

  if (!(await isAllowedEmail(email))) {
    await supabase.auth.signOut();
    return { error: ASHOKA_EMAIL_ERROR };
  }

  const userId = data.user.id;
  const { data: accepted } = await supabase
    .from("policy_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("policy_version", POLICY_VERSION)
    .maybeSingle();
  if (!accepted) {
    await supabase.from("policy_acceptances").insert({ user_id: userId, policy_version: POLICY_VERSION });
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profile) {
    const cookieStore = await cookies();
    cookieStore.set("bwa_has_profile", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: PROFILE_COOKIE_MAX_AGE,
    });
  }
  return { redirectTo: profile ? "/list" : "/onboarding/handle" };
}

export type ClaimHandleState = { error?: string };

export async function claimHandle(
  _prevState: ClaimHandleState,
  formData: FormData
): Promise<ClaimHandleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Self-heal for a user who already has a profile but landed here anyway
  // (e.g. bwa_has_profile was missing for some reason) — redirect straight
  // through instead of letting them resubmit their own handle and hit the
  // confusing "That handle is taken" error below for a handle that's
  // already theirs.
  const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existingProfile) {
    const cookieStore = await cookies();
    cookieStore.set("bwa_has_profile", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: PROFILE_COOKIE_MAX_AGE,
    });
    redirect("/list");
  }

  const parsed = handleSchema.safeParse(formData.get("handle"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid handle." };
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    handle: parsed.data,
    avatar_seed: crypto.randomUUID(),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That handle is taken." };
    }
    return { error: "Couldn't claim that handle. Try again." };
  }

  await logEvent(user.id, "profile_created", {});

  const cookieStore = await cookies();
  cookieStore.set("bwa_has_profile", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PROFILE_COOKIE_MAX_AGE,
  });

  redirect("/list");
}

export type UpdateBioState = { error?: string; saved?: boolean };

// Bio is opt-in and off by default (non-negotiable #5). sanitizeBio() strips
// URLs and @handles server-side regardless of what the client already did —
// this is the enforcement layer, not the textarea's maxLength attribute.
export async function updateBio(
  _prevState: UpdateBioState,
  formData: FormData
): Promise<UpdateBioState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const bioVisible = formData.get("bio_visible") === "true";
  const rawBio = String(formData.get("bio") ?? "");
  const parsed = bioSchema.safeParse(rawBio);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid bio." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ bio: parsed.data || null, bio_visible: bioVisible && parsed.data.length > 0 })
    .eq("id", user.id);

  if (error) {
    return { error: "Couldn't save. Try again." };
  }

  return { saved: true };
}
