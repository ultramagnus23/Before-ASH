"use server";

import { createClient } from "@/lib/supabase/server";
import { runModerationPipeline } from "@/lib/moderation/pipeline";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/*
 * Submitting an item for the shared catalog.
 *
 * Three stages, none of them new: the deterministic filter and the
 * classifier come from lib/moderation/pipeline.ts — the same pipeline every
 * other publication goes through — and the third stage is the curator. There
 * is one definition of "held" in this product and this file does not add a
 * second.
 *
 * FAIL CLOSED. If the classifier cannot run, the pipeline returns 'held' and
 * the submission waits for a human. It never falls through to approved. That
 * matters right now more than it looks: production still reports
 * aiEnabled:false, so today EVERY submission lands in the curator queue —
 * which is the correct behaviour for a broken classifier, and is why this is
 * the right default rather than a degraded one.
 */

const SubmissionSchema = z.object({
  title: z.string().trim().min(4).max(140),
  category: z.string().trim().min(1).max(40),
});

export type SubmitResult =
  | { status: "queued" }
  | { status: "rejected"; reason: string }
  | { status: "error"; message: string };

export async function submitItem(input: unknown): Promise<SubmitResult> {
  const parsed = SubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "A submission needs a title and a category." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };

  // Checked here for a useful message, and enforced again by the RLS insert
  // policy, which is what actually holds the line.
  const { data: invite } = await supabase
    .from("publish_invites")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!invite) {
    return { status: "error", message: "Submitting is invite-only at the moment." };
  }

  // Only the text being judged is passed. There is no field on the pipeline
  // to put an id in, by design — see the §14.1 boundary in call-model.ts.
  // isAnonymous=false: a submission always carries its submitter, because
  // an approved item credits them. There is no anonymous route into the
  // shared catalog.
  const decision = await runModerationPipeline(parsed.data.title, false);

  if (decision.outcome === "rejected") {
    // Nothing is written. A rejected submission is not a record we need to
    // keep about a person, and storing it would build exactly the log the
    // moderation rules say not to build.
    return { status: "rejected", reason: decision.reason };
  }

  // Anything not outright rejected goes to the curator. There is no
  // auto-approve path into the shared catalog: 'approved' from the
  // classifier still means "a human should look", because this is the one
  // surface where a bad item is seen by everyone rather than by a few.
  const { error } = await supabase.from("submissions").insert({
    submitter_id: user.id,
    title: parsed.data.title,
    category: parsed.data.category,
    review_state: "pending_auto",
    scores: "scores" in decision ? decision.scores : null,
  });
  if (error) return { status: "error", message: "Couldn't save that." };

  revalidatePath("/submit");
  return { status: "queued" };
}
