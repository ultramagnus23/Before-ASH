"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// "Respect" — a single reaction type, no counts of different emoji, no
// leaderboard. Toggling is just insert-or-delete against the unique
// (list_item_id, user_id) pair already enforced at the DB level.
export async function toggleReaction(listItemId: string): Promise<{ error?: string; active?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("list_item_id", listItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
    if (error) return { error: "Couldn't undo that." };
    revalidatePath("/feed");
    return { active: false };
  }

  const { error } = await supabase.from("reactions").insert({ list_item_id: listItemId, user_id: user.id });
  if (error) return { error: "Couldn't do that." };
  revalidatePath("/feed");
  return { active: true };
}
