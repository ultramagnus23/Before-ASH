import "server-only";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

/*
 * BUILD-PROMPT.md #17: /admin requires ADMIN_HANDLES allowlist membership
 * AND a verified MFA factor, re-verified if the check is older than a few
 * hours. Supabase's own aal2 session status doesn't expire on a timer by
 * itself — it persists for the life of the session/refresh token — so the
 * "older than a few hours" freshness requirement is enforced with our own
 * signed cookie, set only right after a successful mfa.verify() call in
 * app/admin/verify, checked here on every /admin request.
 */

const MFA_FRESHNESS_HOURS = 4;
export const MFA_VERIFIED_COOKIE = "bwa_admin_mfa_verified_at";

export type AdminGuardResult =
  | { status: "ok"; userId: string; handle: string }
  | { status: "not_admin" }
  | { status: "needs_enrollment"; userId: string }
  | { status: "needs_verification"; userId: string };

export async function checkAdminAccess(): Promise<AdminGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_admin" };

  const adminHandles = (process.env.ADMIN_HANDLES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  if (!profile || !adminHandles.includes(profile.handle.toLowerCase())) {
    return { status: "not_admin" };
  }

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factorsData?.totp?.find((f) => f.status === "verified");
  if (!verifiedTotp) {
    return { status: "needs_enrollment", userId: user.id };
  }

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel !== "aal2") {
    return { status: "needs_verification", userId: user.id };
  }

  const cookieStore = await cookies();
  const verifiedAt = cookieStore.get(MFA_VERIFIED_COOKIE)?.value;
  const freshEnough = verifiedAt && Date.now() - new Date(verifiedAt).getTime() < MFA_FRESHNESS_HOURS * 60 * 60 * 1000;

  if (!freshEnough) {
    return { status: "needs_verification", userId: user.id };
  }

  return { status: "ok", userId: user.id, handle: profile.handle };
}
