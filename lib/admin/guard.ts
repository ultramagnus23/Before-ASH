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
  | { status: "ok"; userId: string; handle: string; role: "admin" | "oversight" }
  | { status: "not_admin" }
  | { status: "needs_enrollment"; userId: string }
  | { status: "needs_verification"; userId: string };

function handleList(envName: string): string[] {
  return (process.env[envName] ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

// Mutating admin actions: ADMIN_HANDLES only.
export async function checkAdminAccess(): Promise<AdminGuardResult> {
  return checkAccess(false);
}

// Read-only oversight pages (/admin/overview, /admin/audit): admins plus
// OVERSIGHT_HANDLES (e.g. Student Life Office staff). Same MFA gate. Oversight
// users can never reach a mutating action; those call checkAdminAccess().
export async function checkOversightAccess(): Promise<AdminGuardResult> {
  return checkAccess(true);
}

async function checkAccess(allowOversight: boolean): Promise<AdminGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_admin" };

  const adminHandles = handleList("ADMIN_HANDLES");
  const oversightHandles = allowOversight ? handleList("OVERSIGHT_HANDLES") : [];

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  const handleLower = profile?.handle.toLowerCase() ?? "";
  const role = adminHandles.includes(handleLower) ? "admin" : oversightHandles.includes(handleLower) ? "oversight" : null;
  if (!profile || !role) {
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

  return { status: "ok", userId: user.id, handle: profile.handle, role };
}
