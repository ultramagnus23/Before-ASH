"use server";

import { createClient } from "@/lib/supabase/server";
import { emailSchema, handleSchema, bioSchema } from "@/lib/validation";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const POLICY_VERSION = process.env.POLICY_VERSION ?? "unversioned";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
  cookieStore.set("bwa_has_profile", "1", { httpOnly: true, sameSite: "lax", path: "/" });

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
