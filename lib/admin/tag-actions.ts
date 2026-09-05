"use server";

import { checkAdminAccess } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  TIME_OF_DAY,
  DAY_OF_WEEK,
  DURATION,
  SETTING,
  COST_BAND,
  SEASON,
  GROUP_SIZE,
} from "@/lib/tags/dimensions";

/*
 * Promoting a proposal to reviewed truth. This is the ONLY way a tag becomes
 * readable by a user -- RLS exposes state='reviewed' and nothing else, and
 * the reviewed row cannot exist without a reviewer (a check constraint, not
 * a convention).
 *
 * The values are re-validated here against the same closed vocabularies the
 * model was given, even though they arrive from our own UI: this writes with
 * the service role, which bypasses RLS entirely, so the Zod schema is the
 * actual boundary.
 */

const TagsSchema = z.object({
  questId: z.string().min(1),
  time_of_day: z.array(z.enum(TIME_OF_DAY)).min(1),
  day_of_week: z.array(z.enum(DAY_OF_WEEK)).min(1),
  duration: z.enum(DURATION),
  setting: z.enum(SETTING),
  cost_band: z.enum(COST_BAND),
  season: z.enum(SEASON),
  group_size: z.enum(GROUP_SIZE),
});

export type TagReviewInput = z.infer<typeof TagsSchema>;

export async function commitTagReview(input: TagReviewInput): Promise<{ error?: string }> {
  const access = await checkAdminAccess();
  if (access.status !== "ok") return { error: "Not authorized." };

  const parsed = TagsSchema.safeParse(input);
  if (!parsed.success) return { error: "Those tags aren't valid." };
  const { questId, ...tags } = parsed.data;

  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("quest_tags").upsert(
    {
      quest_id: questId,
      state: "reviewed",
      time_of_day: tags.time_of_day,
      day_of_week: tags.day_of_week,
      duration: tags.duration,
      setting: tags.setting,
      cost_band: tags.cost_band,
      season: tags.season,
      group_size: tags.group_size,
      // A human decided this, so there is no confidence to report. Leaving
      // the model's numbers on a reviewed row would make a reviewed tag look
      // uncertain to anything that reads confidence later.
      confidence: {},
      min_confidence: 1,
      model: null,
      reviewed_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "quest_id,state" }
  );
  if (error) return { error: "Couldn't save that." };

  // solo/group has one live home, quests.group_size, and it is not this
  // table -- see the header of db/migrations/0015_quest_tags.sql. The
  // reviewed row records what the curator decided; this line is what makes
  // the decision take effect anywhere it is already read.
  const { error: questError } = await supabase
    .from("quests")
    .update({ group_size: tags.group_size })
    .eq("id", questId);
  if (questError) return { error: "Saved the tags, but couldn't update group size." };

  revalidatePath("/admin/tags");
  revalidatePath("/explore");
  return {};
}
