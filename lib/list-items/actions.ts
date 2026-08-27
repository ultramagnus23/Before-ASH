"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { runModerationPipeline } from "@/lib/moderation/pipeline";
import { isAnonymousReviewEnabled, checkAnonymousEligibility, isAnonymousPaused } from "@/lib/moderation/anonymous-review";
import { one } from "@/lib/supabase/embed";

const customItemSchema = z.object({
  title: z.string().trim().min(3, "A few more words than that.").max(140),
  category: z.string().min(1),
});

export type AddCustomItemState = { error?: string; ok?: boolean };

// Custom item entry is first-class on /list, not a secondary path behind
// the catalog (BUILD-PROMPT.md's catalog non-negotiable) — this is the
// exact same list_items insert that adding from /explore uses, just with
// custom_title set instead of quest_id. New items default to private, so
// nothing here touches the moderation pipeline (P6) at all.
export async function addCustomItem(
  _prevState: AddCustomItemState,
  formData: FormData
): Promise<AddCustomItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = customItemSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  // Dynamic import, same isolation reasoning as the anonymous-visibility
  // path above: a missing/broken Upstash config must never take down
  // add-to-list-adjacent flows in this same file, including markDone.
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rateLimitResult = await checkRateLimit("customItemsPerHour", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "That's a lot of custom items in one hour — try again later." };
  }

  const { error } = await supabase.from("list_items").insert({
    owner_id: user.id,
    custom_title: parsed.data.title,
    category: parsed.data.category,
    visibility: "private",
    review_state: "draft",
  });

  if (error) {
    return { error: "Couldn't add that. Try again." };
  }

  revalidatePath("/list");
  return { ok: true };
}

// "Copy" a fully custom item from someone else's feed entry onto your own
// list — matches the product pitch ("everything you finish lands on a page
// other people can copy from"). This creates a brand-new list_items row
// for the copier; it can never reference the original owner's row, so
// there's no shared-completion-state risk here, same reasoning as boards
// in BUILD-PROMPT.md §13.3.
export async function addCustomCopy(title: string, category: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = customItemSchema.safeParse({ title, category });
  if (!parsed.success) return { error: "Couldn't copy that." };

  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rateLimitResult = await checkRateLimit("customItemsPerHour", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "That's a lot of adds in one hour — try again later." };
  }

  const { error } = await supabase.from("list_items").insert({
    owner_id: user.id,
    custom_title: parsed.data.title,
    category: parsed.data.category,
    visibility: "private",
    review_state: "draft",
  });

  if (error) return { error: "Couldn't add that." };
  revalidatePath("/list");
  return { ok: true };
}

export type AddFromCatalogState = { error?: string; ok?: boolean };

export async function addFromCatalog(questId: string): Promise<AddFromCatalogState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("category")
    .eq("id", questId)
    .maybeSingle();

  if (questError || !quest) {
    return { error: "That item doesn't exist." };
  }

  const { error } = await supabase.from("list_items").insert({
    owner_id: user.id,
    quest_id: questId,
    category: quest.category,
    visibility: "private",
    review_state: "draft",
  });

  if (error) {
    // Unique-ish duplicate add isn't actually constrained at the DB level
    // (a user can add the same catalog quest twice on purpose, e.g. to
    // retry it) so any error here is a real failure, not a dup collision.
    return { error: "Couldn't add that. Try again." };
  }

  revalidatePath("/list");
  revalidatePath("/explore");
  return { ok: true };
}

export async function removeListItem(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.from("list_items").delete().eq("id", itemId).eq("owner_id", user.id);
  if (error) return { error: "Couldn't remove that." };

  revalidatePath("/list");
  return {};
}

const proofSchema = z.string().trim().max(200).optional();

export type MarkDoneResult = { error?: string; completedAt?: string };

// The core action, alongside add-to-list, that may never break
// (BUILD-PROMPT.md #20 / P4's blocking e2e test). Deliberately no
// "unmark" — the press-and-hold + the keyboard confirm() are both already
// friction against accidental stamps, and once something's stamped it
// stays stamped, same as the reference prototype. Moderation (P6) isn't
// wired up yet, so this never touches review_state — a private item never
// needs it, and a public/anonymous item's proof text just sits unmoderated
// until P6 exists, same as it already does for the item's title itself.
export async function markDone(itemId: string, proof?: string): Promise<MarkDoneResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsedProof = proofSchema.safeParse(proof);
  if (!parsedProof.success) {
    return { error: "That proof line is too long." };
  }

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("list_items")
    .update({ completed_at: completedAt, proof: parsedProof.data || null })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .is("completed_at", null); // idempotent: a second stamp attempt on an already-done item is a no-op, not an overwrite

  if (error) {
    return { error: "Couldn't stamp that. Try again." };
  }

  revalidatePath("/list");
  return { completedAt };
}

export async function setProof(itemId: string, proof: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = proofSchema.safeParse(proof);
  if (!parsed.success) return { error: "Too long." };

  const { error } = await supabase
    .from("list_items")
    .update({ proof: parsed.data || null })
    .eq("id", itemId)
    .eq("owner_id", user.id);

  if (error) return { error: "Couldn't save that." };
  revalidatePath("/list");
  return {};
}

const VISIBILITIES = ["private", "anonymous", "public"] as const;
const visibilitySchema = z.enum(VISIBILITIES);

export type SetVisibilityResult = { error?: string; reviewState?: string };

// P5 gap-fill, wired up for real in P6: setting an item to public/anonymous
// now actually runs the moderation pipeline (lib/moderation/pipeline.ts)
// against its title text — deterministic filter + LLM classifier for named
// items, with anonymous items additionally requiring the eligibility gate,
// weekly rate limit, and standing-cap circuit breaker from
// BUILD-PROMPT.md §6/§14. Going back to private is always immediate and
// free of all of this — private never needed review_state to mean anything.
export async function setVisibility(
  itemId: string,
  visibility: (typeof VISIBILITIES)[number]
): Promise<SetVisibilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = visibilitySchema.safeParse(visibility);
  if (!parsed.success) return { error: "Invalid visibility." };

  const { data: current, error: fetchError } = await supabase
    .from("list_items")
    .select("visibility, review_state, custom_title, quest_id, quest:quests(title)")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !current) return { error: "Couldn't find that item." };

  if (parsed.data === "private") {
    const { error } = await supabase
      .from("list_items")
      .update({ visibility: "private" })
      .eq("id", itemId)
      .eq("owner_id", user.id);
    if (error) return { error: "Couldn't update that." };
    revalidatePath("/list");
    revalidatePath("/feed");
    return { reviewState: current.review_state };
  }

  const text = one(current.quest)?.title ?? current.custom_title ?? "";

  if (parsed.data === "anonymous") {
    if (!isAnonymousReviewEnabled()) {
      return { error: "Anonymous posting is turned off right now." };
    }

    const { paused } = await isAnonymousPaused();
    if (paused) {
      return { error: "Anonymous is paused. Back soon." };
    }

    const eligibility = await checkAnonymousEligibility(user.id);
    if (!eligibility.eligible) {
      return { error: eligibility.reason };
    }

    // Dynamic import is deliberate, not stylistic: lib/rate-limit.ts calls
    // Redis.fromEnv() at module load, which throws if Upstash isn't
    // configured. A static top-of-file import would mean a missing/broken
    // Upstash config breaks EVERY function in this file — including
    // markDone and addFromCatalog, the two paths that may never break
    // (#20). Loading it only here contains that blast radius to the
    // anonymous-visibility path, which is exactly where it belongs.
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const rateLimitResult = await checkRateLimit("anonymousPerWeek", user.id);
    if (!rateLimitResult.allowed) {
      return { error: "One anonymous post per week — try again later." };
    }
  }

  const decision = await runModerationPipeline(text, parsed.data === "anonymous");

  const update: { visibility: string; review_state: string } = {
    visibility: parsed.data,
    review_state: decision.outcome,
  };

  const { error } = await supabase.from("list_items").update(update).eq("id", itemId).eq("owner_id", user.id);
  if (error) return { error: "Couldn't update that." };

  if (decision.outcome === "rejected") {
    await createServiceRoleClient()
      .from("moderation_log")
      .insert({ actor: "system", action: "reject", target_type: "list_item", target_id: itemId, reason: decision.reason });
  }

  revalidatePath("/list");
  revalidatePath("/feed");
  return { reviewState: decision.outcome, error: decision.outcome === "rejected" ? decision.reason : undefined };
}

// §14d: "if an item exceeds 5 days pending, auto-notify the author with an
// apology and an offer to convert it to a named post instead, and stays
// pending regardless — no auto-approve on any timeout, ever." The
// "auto-notify" part has no email provider to run through yet (same gap as
// account deletion, §8), so the apology is a banner computed client-side
// from age + review_state (app/list/row.tsx) rather than a push
// notification. This function is the "offer to convert" half — it goes
// through the exact same setVisibility('public') path a fresh named
// submission would, it does not special-case a shortcut approval.
export async function convertToNamed(itemId: string): Promise<SetVisibilityResult> {
  return setVisibility(itemId, "public");
}
