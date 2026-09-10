import "server-only";
import { createClient } from "@/lib/supabase/server";
import { selectTonight, type TonightCandidate } from "@/lib/tonight/select";
import type { TimeOfDay, DayOfWeek } from "@/lib/tags/dimensions";

export type TonightItem = TonightCandidate & {
  alreadyAdded: boolean;
  countedIn: boolean;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  category: string;
  quest_tags: { time_of_day: TimeOfDay[]; day_of_week: DayOfWeek[] }[] | null;
};

/**
 * The whole candidate set, tags attached where they exist.
 *
 * The embedded quest_tags rows come back through RLS, which exposes only
 * state='reviewed' -- so an unreviewed proposal cannot reach this page even
 * if someone forgets a filter here. That is the reason the state lives in a
 * policy rather than in a where-clause.
 */
export async function getTonight(userId: string, at = new Date()): Promise<TonightItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quests")
    .select("id, slug, title, category, quest_tags(time_of_day, day_of_week)")
    .eq("is_custom", false);
  if (error) throw error;

  const candidates: TonightCandidate[] = ((data ?? []) as unknown as Row[]).map((row) => {
    const tag = row.quest_tags?.[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      timeOfDay: tag?.time_of_day ?? [],
      dayOfWeek: tag?.day_of_week ?? [],
    };
  });

  const picked = selectTonight(candidates, { userId, at });
  if (picked.length === 0) return [];

  // Resolved only for the handful actually shown, rather than for all 491.
  const ids = picked.map((p) => p.id);
  const [{ data: mine }, { data: interests }] = await Promise.all([
    supabase.from("list_items").select("quest_id").eq("owner_id", userId).in("quest_id", ids),
    supabase.from("quest_interests").select("quest_id").in("quest_id", ids),
  ]);

  const added = new Set((mine ?? []).map((r) => r.quest_id as string));
  // RLS restricts quest_interests to the caller's own rows, so anything that
  // comes back is by definition the viewer's own -- no owner filter is
  // written here, same as lib/queries/notifications.ts.
  const counted = new Set((interests ?? []).map((r) => r.quest_id as string));

  return picked.map((p) => ({
    ...p,
    alreadyAdded: added.has(p.id),
    countedIn: counted.has(p.id),
  }));
}
