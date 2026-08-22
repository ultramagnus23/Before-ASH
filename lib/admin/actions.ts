"use server";

import { checkAdminAccess } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireAdmin() {
  const access = await checkAdminAccess();
  if (access.status !== "ok") throw new Error("Not authorized.");
  return access;
}

export async function approveItem(listItemId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("list_items").update({ review_state: "approved" }).eq("id", listItemId);
  if (error) return { error: "Couldn't approve that." };

  await supabase.from("review_assignments").insert({
    list_item_id: listItemId,
    assigned_to: admin.userId,
    assigned_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    decision: "approved",
  });
  await supabase
    .from("moderation_log")
    .insert({ actor: admin.userId, action: "approve", target_type: "list_item", target_id: listItemId });

  revalidatePath("/admin");
  revalidatePath("/feed");
  return {};
}

export async function rejectItem(listItemId: string, reason: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const parsedReason = z.string().trim().min(3).max(500).safeParse(reason);
  if (!parsedReason.success) return { error: "Reason is required." };

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("list_items").update({ review_state: "rejected" }).eq("id", listItemId);
  if (error) return { error: "Couldn't reject that." };

  await supabase.from("review_assignments").insert({
    list_item_id: listItemId,
    assigned_to: admin.userId,
    assigned_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    decision: "rejected",
  });
  await supabase.from("moderation_log").insert({
    actor: admin.userId,
    action: "reject",
    target_type: "list_item",
    target_id: listItemId,
    reason: parsedReason.data,
  });

  revalidatePath("/admin");
  revalidatePath("/feed");
  return {};
}

// Un-hides an auto-hidden ('held') or flagged item without treating it as
// a fresh moderation decision — this is the "reversible, one-click
// restore" from §7.1, distinct from approveItem in intent even though the
// resulting review_state is the same value.
export async function restoreItem(listItemId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("list_items")
    .update({ review_state: "approved", appealed_at: null })
    .eq("id", listItemId);
  if (error) return { error: "Couldn't restore that." };

  await supabase
    .from("moderation_log")
    .insert({ actor: admin.userId, action: "restore", target_type: "list_item", target_id: listItemId });

  revalidatePath("/admin");
  revalidatePath("/feed");
  return {};
}

const revealReasonSchema = z.string().trim().min(20, "Needs at least 20 characters — a real reason, not a shrug.");

// §14h: identity reveal requires a written reason (>=20 chars) and writes
// an append-only row to identity_reveals — no update/delete grant exists
// on that table at the DB level (db/migrations/0001_rls.sql), so this is
// genuinely permanent the moment it's inserted.
export async function revealIdentity(listItemId: string, reason: string): Promise<{ error?: string; ownerHandle?: string }> {
  const admin = await requireAdmin();
  const parsedReason = revealReasonSchema.safeParse(reason);
  if (!parsedReason.success) return { error: parsedReason.error.issues[0]?.message ?? "Invalid reason." };

  const supabase = createServiceRoleClient();
  const { data: item } = await supabase.from("list_items").select("owner_id").eq("id", listItemId).maybeSingle();
  if (!item) return { error: "Item not found." };

  const { error } = await supabase.from("identity_reveals").insert({
    list_item_id: listItemId,
    admin_id: admin.userId,
    reason: parsedReason.data,
    revealed_owner_id: item.owner_id,
  });
  if (error) return { error: "Couldn't record that reveal." };

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", item.owner_id).maybeSingle();

  revalidatePath("/admin");
  return { ownerHandle: profile?.handle };
}
