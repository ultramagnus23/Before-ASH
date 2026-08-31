"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { emailSchema, handleSchema, bioSchema, ASHOKA_EMAIL_ERROR } from "@/lib/validation";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PROFILE_COOKIE_MAX_AGE } from "./complete-session";

const POLICY_VERSION = process.env.POLICY_VERSION ?? "unversioned";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

export type RequestLinkState = { error?: string; sent?: boolean };

// §8.2: the checkbox that gates the magic-link submit button is enforced
// here too, server-side — a client-side-only disabled button is not an
// enforcement layer, it's a UX nicety. `consented !== 'true'` fails closed.
export async function requestMagicLink(
  _prevState: RequestLinkState,
  formData: FormData
): Promise<RequestLinkState> {
  const consented = formData.get("consent") === "true";
  if (!consented) {
    return { error: "You need to accept the terms, privacy, and community rules first." };
  }

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  if (!(await isAllowedEmail(parsed.data))) {
    return { error: ASHOKA_EMAIL_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // policy_version travels in the redirect URL so the callback route
      // can log acceptance against a real user id, which doesn't exist
      // until the magic link is confirmed. Not sensitive data.
      emailRedirectTo: `${APP_URL}/auth/callback?policy_version=${encodeURIComponent(POLICY_VERSION)}`,
    },
  });

  if (error) {
    // Never leak whether an account exists — same message either way.
    return { error: "Couldn't send the link. Try again in a moment." };
  }

  return { sent: true };
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
