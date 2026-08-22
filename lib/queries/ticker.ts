import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/*
 * The cover page (app/page.tsx) is the one page a logged-out visitor can
 * reach — everything else requires @ashoka.edu.in auth, and every RLS
 * policy in this app is scoped `to authenticated`, so a logged-out
 * request would get zero rows from any of them. Rather than widen RLS to
 * grant the `anon` role read access (a change to the app's core privacy
 * boundary, for a marketing nicety), this uses the service role for one
 * narrow, read-only, already-public query: a handful of recent public
 * completions, run through the exact same serializer rules as everywhere
 * else (never `note`, never an anonymous item's owner).
 */
export type TickerEntry = { text: string; visibility: "public" | "anonymous" };

export async function getTickerPreview(limit = 4): Promise<TickerEntry[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("list_items")
    .select("custom_title, proof, visibility, quest:quests(title), owner:profiles(handle)")
    .in("visibility", ["public", "anonymous"])
    .in("review_state", ["approved", "flagged"])
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row: any) => {
    const title = row.quest?.title ?? row.custom_title ?? "";
    const who = row.visibility === "anonymous" ? "Someone" : row.owner?.handle ? `@${row.owner.handle}` : "Someone";
    return {
      text: `${who} stamped "${title}"`,
      visibility: row.visibility,
    };
  });
}
