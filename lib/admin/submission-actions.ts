"use server";

import { checkAdminAccess } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/*
 * The curator's decisions on submissions.
 *
 * Approving mints a catalog row and links the submission to it. The
 * credit lives on quests.created_by — a column that already existed and is
 * null for the seed catalog — rather than a duplicated handle, so a person
 * changing their handle does not orphan their credit.
 */

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const ApproveSchema = z.object({
  submissionId: z.string().uuid(),
  // The curator can correct these before the item goes live; the submitted
  // values are only a proposal.
  title: z.string().trim().min(4).max(140),
  category: z.string().trim().min(1).max(40),
  difficulty: z.number().int().min(1).max(3),
  spice: z.number().int().min(1).max(3),
  groupSize: z.enum(["solo", "duo", "group", "any"]),
  locale: z.enum(["campus", "ncr", "anywhere", "any"]),
});

export async function approveSubmission(input: unknown): Promise<{ error?: string }> {
  const access = await checkAdminAccess();
  if (access.status !== "ok") return { error: "Not authorized." };

  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success) return { error: "Those details aren't valid." };
  const { submissionId, title, category, difficulty, spice, groupSize, locale } = parsed.data;

  const supabase = createServiceRoleClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, submitter_id, review_state")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return { error: "No such submission." };
  if (submission.review_state === "approved") return { error: "Already approved." };

  // Ids in the catalog are human-readable and prefixed by origin: SUB- makes
  // a submitted item distinguishable from the CP-#### seed catalog at a
  // glance, in logs and in the database, without a second column.
  const questId = `SUB-${submissionId.slice(0, 8).toUpperCase()}`;

  // Slugs are unique. A submitted item whose title collides with an existing
  // one gets the id appended rather than failing the whole approval.
  const base = slugify(title);
  const { data: clash } = await supabase.from("quests").select("id").eq("slug", base).maybeSingle();
  const slug = clash ? `${base}-${submissionId.slice(0, 6)}` : base;

  const { error: questError } = await supabase.from("quests").insert({
    id: questId,
    slug,
    title,
    category,
    difficulty,
    spice,
    group_size: groupSize,
    locale,
    is_custom: false,
    // The credit. Null for everything seeded; set for everything submitted.
    created_by: submission.submitter_id,
  });
  if (questError) return { error: "Couldn't add that to the catalog." };

  const { error: linkError } = await supabase
    .from("submissions")
    .update({
      review_state: "approved",
      published_quest_id: questId,
      decided_by: access.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (linkError) {
    // The check constraint ties approved to published_quest_id, so a failure
    // here would leave a catalog row with no submission pointing at it.
    await supabase.from("quests").delete().eq("id", questId);
    return { error: "Couldn't link that submission." };
  }

  await supabase.from("moderation_log").insert({
    actor: access.userId,
    action: "approve",
    target_type: "submission",
    target_id: submissionId,
  });

  revalidatePath("/admin/submissions");
  revalidatePath("/explore");
  return {};
}

export async function rejectSubmission(submissionId: string): Promise<{ error?: string }> {
  const access = await checkAdminAccess();
  if (access.status !== "ok") return { error: "Not authorized." };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("submissions")
    .update({
      review_state: "rejected",
      decided_by: access.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { error: "Couldn't save that." };

  await supabase.from("moderation_log").insert({
    actor: access.userId,
    action: "reject",
    target_type: "submission",
    target_id: submissionId,
  });

  revalidatePath("/admin/submissions");
  return {};
}

/** Grant someone the ability to submit. Invite-only, and this is the door. */
export async function inviteToPublish(handle: string): Promise<{ error?: string }> {
  const access = await checkAdminAccess();
  if (access.status !== "ok") return { error: "Not authorized." };

  const supabase = createServiceRoleClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("handle", handle.trim())
    .maybeSingle();
  if (!profile) return { error: "No one with that handle." };

  const { error } = await supabase
    .from("publish_invites")
    .upsert({ user_id: profile.id, invited_by: access.userId }, { onConflict: "user_id" });
  if (error) return { error: "Couldn't send that invite." };

  revalidatePath("/admin/submissions");
  return {};
}
