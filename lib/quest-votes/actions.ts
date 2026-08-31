"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export type ToggleVoteResult = { error?: string; voted?: boolean };

// Insert-or-delete against the unique (quest_id, user_id) pair the DB
// already enforces — same shape as lib/reactions/actions.ts's toggle, and
// for the same reason: a vote has no mutable fields, so there's nothing to
// update.
export async function toggleQuestVote(questId: string): Promise<ToggleVoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=%2Fvote");

  const { data: existing } = await supabase
    .from("quest_votes")
    .select("id")
    .eq("quest_id", questId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("quest_votes").delete().eq("id", existing.id);
    if (error) return { error: "Couldn't undo that vote." };
    revalidatePath("/vote");
    return { voted: false };
  }

  const { error } = await supabase.from("quest_votes").insert({ quest_id: questId, user_id: user.id });
  if (error) return { error: "Couldn't record that vote." };
  revalidatePath("/vote");
  return { voted: true };
}
