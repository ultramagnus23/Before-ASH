"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/*
 * Takes a HANDLE, never an id, and deliberately so: PublicListItem
 * (lib/queries/list-items.ts) never carries owner_id, only ownerHandle
 * (which is itself always null for anonymous items). If this function took
 * an id instead, something upstream would eventually need to put an
 * owner id into a public-facing type to make the "Block" button work —
 * exactly the leak §8's non-negotiable #3 exists to prevent. There is
 * deliberately no way to block the author of an anonymous post: you can't
 * block an identity you were never shown, and exposing one just to enable
 * blocking would defeat the anonymity the whole feature depends on.
 * Reporting is still available for anonymous content — see
 * lib/reports/actions.ts.
 */
export async function blockUserByHandle(handle: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: target } = await supabase.from("profiles").select("id").eq("handle", handle).maybeSingle();
  if (!target) return { error: "Couldn't find that person." };
  if (target.id === user.id) return { error: "Can't block yourself." };

  // One tap, per BUILD-PROMPT.md #15 — no confirmation dialog, unlike
  // account deletion. It's fully reversible and low-stakes enough that
  // friction here just protects harassers, not the person blocking.
  const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: target.id });
  if (error && error.code !== "23505") return { error: "Couldn't block that." };

  revalidatePath("/feed");
  return {};
}

export async function unblockUserByHandle(handle: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: target } = await supabase.from("profiles").select("id").eq("handle", handle).maybeSingle();
  if (!target) return { error: "Couldn't find that person." };

  const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target.id);
  if (error) return { error: "Couldn't unblock that." };

  revalidatePath("/feed");
  return {};
}
