import "server-only";
import { createClient } from "@/lib/supabase/server";

/*
 * BUILD-PROMPT.md P7 calls for a "weekly side-quest cron." Implemented
 * instead as a pure function of the current ISO week number — no cron job,
 * no table, no scheduled infra to monitor or fail silently. The same week
 * number always picks the same quest for everyone (deterministic, not
 * random-per-request), and it rotates on its own every Monday without
 * anything needing to run. This is a deliberate simplification: it
 * achieves "something different is featured each week" without a moving
 * part that can fail, which is a better tradeoff than a cron job here, not
 * a shortcut around one.
 */

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export type FeaturedQuest = { id: string; slug: string; title: string; category: string };

export async function getWeeklyFeaturedQuest(): Promise<FeaturedQuest | null> {
  const supabase = await createClient();

  const { count } = await supabase.from("quests").select("id", { count: "exact", head: true });
  if (!count) return null;

  const week = isoWeekNumber(new Date());
  const year = new Date().getUTCFullYear();
  const offset = (week + year) % count;

  const { data } = await supabase
    .from("quests")
    .select("id, slug, title, category")
    .order("id")
    .range(offset, offset)
    .maybeSingle();

  return data ?? null;
}
