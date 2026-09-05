import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { QuestTags, TagConfidence, Dimension } from "@/lib/tags/dimensions";
import { DIMENSIONS } from "@/lib/tags/dimensions";

/*
 * The tag review queue, read through the service role because proposed rows
 * have no RLS policy at all -- an unreviewed machine guess is not something
 * a signed-in user should be able to discover by querying around the UI.
 * See db/migrations/0015_quest_tags.sql.
 *
 * Ordered least-confident first. That is the whole design of the queue: the
 * items where the model hedged are the ones where a human's attention is
 * worth something, and the confident ones can be confirmed in a keystroke
 * at the end.
 */

export type TagReviewItem = {
  questId: string;
  title: string;
  category: string;
  tags: QuestTags;
  confidence: TagConfidence;
  minConfidence: number;
  /** The dimensions the model was least sure of, worst first. */
  weakest: Dimension[];
};

type Row = {
  quest_id: string;
  time_of_day: QuestTags["time_of_day"];
  day_of_week: QuestTags["day_of_week"];
  duration: QuestTags["duration"];
  setting: QuestTags["setting"];
  cost_band: QuestTags["cost_band"];
  season: QuestTags["season"];
  group_size: QuestTags["group_size"];
  confidence: TagConfidence | null;
  min_confidence: number;
  quests: { title: string; category: string } | { title: string; category: string }[] | null;
};

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getTagReviewQueue(limit = 25): Promise<TagReviewItem[]> {
  const supabase = createServiceRoleClient();

  // Everything already reviewed is excluded by id rather than by a join,
  // because PostgREST cannot express "no sibling row with state='reviewed'"
  // and a wrong join here would silently re-queue finished work.
  const { data: done, error: doneError } = await supabase
    .from("quest_tags")
    .select("quest_id")
    .eq("state", "reviewed");
  if (doneError) throw doneError;
  const reviewed = new Set((done ?? []).map((r) => r.quest_id as string));

  const { data, error } = await supabase
    .from("quest_tags")
    .select(
      "quest_id, time_of_day, day_of_week, duration, setting, cost_band, season, group_size, confidence, min_confidence, quests(title, category)"
    )
    .eq("state", "proposed")
    .order("min_confidence", { ascending: true })
    .limit(limit + reviewed.size);
  if (error) throw error;

  return ((data ?? []) as unknown as Row[])
    .filter((row) => !reviewed.has(row.quest_id))
    .slice(0, limit)
    .map((row) => {
      const quest = first(row.quests);
      const confidence = row.confidence ?? {};
      return {
        questId: row.quest_id,
        title: quest?.title ?? row.quest_id,
        category: quest?.category ?? "",
        tags: {
          time_of_day: row.time_of_day,
          day_of_week: row.day_of_week,
          duration: row.duration,
          setting: row.setting,
          cost_band: row.cost_band,
          season: row.season,
          group_size: row.group_size,
        },
        confidence,
        minConfidence: row.min_confidence,
        weakest: [...DIMENSIONS]
          .sort((a, b) => (confidence[a] ?? 0) - (confidence[b] ?? 0))
          .filter((d) => (confidence[d] ?? 0) < 0.6),
      };
    });
}

/**
 * How much is left to review.
 *
 * The no-denominator rule in the spec is a rule about the product: a student
 * must never see how much of the catalog they have not done. This is the
 * curator's own tooling, where "how many are left" is the only question that
 * matters for deciding whether to keep going. It is not rendered on any
 * surface a student can reach.
 */
export async function getTagReviewProgress(): Promise<{ remaining: number; reviewed: number }> {
  const supabase = createServiceRoleClient();
  const [{ count: proposed }, { count: reviewed }] = await Promise.all([
    supabase.from("quest_tags").select("quest_id", { count: "exact", head: true }).eq("state", "proposed"),
    supabase.from("quest_tags").select("quest_id", { count: "exact", head: true }).eq("state", "reviewed"),
  ]);
  return { remaining: Math.max(0, (proposed ?? 0) - (reviewed ?? 0)), reviewed: reviewed ?? 0 };
}
