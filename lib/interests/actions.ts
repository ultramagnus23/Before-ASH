"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/*
 * "Count me in" — the match mechanic's only entry point.
 *
 * Almost nothing happens here on purpose. Registering interest, finding a
 * counterpart, creating or joining the outing group, marking both interests
 * matched and notifying both people all happen inside one SQL function
 * (register_quest_interest, db/migrations/0014_match_mechanic.sql) because
 * they have to be atomic. Split across round trips, two people tapping at
 * the same moment can both read "no counterpart yet" and neither gets
 * matched — or two groups get created for one pair. This file is a thin,
 * authenticated shell around that.
 *
 * Deliberately NOT gated behind an existing connection: matching is the
 * primary discovery path and has to be able to introduce strangers. Blocks
 * are still absolute, enforced inside the function.
 */

export type CountMeInResult = {
  registered: boolean;
  matched: boolean;
  groupId?: string;
  error?: string;
};

export async function countMeIn(questId: string): Promise<CountMeInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data, error } = await supabase.rpc("register_quest_interest", { p_quest_id: questId });

  if (error) {
    // No detail leaked to the client: the failure modes here are "not
    // authenticated" and "database said no", neither of which the UI can
    // act on differently.
    console.error("register_quest_interest failed:", error.message);
    return { registered: false, matched: false, error: "Couldn't do that right now." };
  }

  const result = data as { registered?: boolean; matched?: boolean; group_id?: string } | null;
  const matched = Boolean(result?.matched);

  if (matched) {
    // Only revalidate on a real match. A plain registration changes nothing
    // anyone can see — interest is private — so re-rendering would be pure
    // cost for no visible difference.
    revalidatePath("/notifications");
  }

  return {
    registered: Boolean(result?.registered),
    matched,
    groupId: result?.group_id,
  };
}

/** Withdraw interest. Plain delete under RLS — a user owns their own rows. */
export async function withdrawInterest(questId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase
    .from("quest_interests")
    .delete()
    .eq("quest_id", questId)
    .eq("user_id", user.id);

  if (error) return { error: "Couldn't withdraw that." };
  return {};
}
