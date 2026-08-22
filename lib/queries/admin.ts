import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Reads ONLY from the review_queue view (db/migrations/0006_safety_p6.sql),
// which deliberately has no owner_id/handle/email column to select in the
// first place — the reviewer's two questions ("does this break a rule" /
// "could three people identify the author") are answerable from exactly
// what's returned here, per BUILD-PROMPT.md §6 and §14g.
export type ReviewQueueItem = {
  listItemId: string;
  text: string;
  category: string;
  visibility: "anonymous" | "public";
  reviewState: "pending_human" | "held" | "flagged";
  createdAt: string;
  appealedAt: string | null;
  accountAgeBucket: "<1mo" | "1-6mo" | "6mo+";
  priorRejectionCount: number;
};

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("review_queue").select("*");
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    listItemId: row.list_item_id,
    text: row.text,
    category: row.category,
    visibility: row.visibility,
    reviewState: row.review_state,
    createdAt: row.created_at,
    appealedAt: row.appealed_at,
    accountAgeBucket: row.account_age_bucket,
    priorRejectionCount: row.prior_rejection_count,
  }));
}
