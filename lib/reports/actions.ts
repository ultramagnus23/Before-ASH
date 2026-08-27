"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { one } from "@/lib/supabase/embed";

const reasonSchema = z.string().trim().min(3, "Say a little more.").max(500);

// A week-wide window: if every reporter's account was created within the
// same 7-day span, that reads as a coordinated brigade rather than organic
// concern — §7.1's "distinct-reporter, distinct-reason... not all created
// in the same window" bar.
const SUSPICIOUS_ACCOUNT_AGE_SPREAD_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_HIDE_REPORT_COUNT = 3;

export type FileReportResult = { error?: string; ok?: boolean };

export async function fileReport(listItemId: string, reason: string): Promise<FileReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return { error: parsedReason.error.issues[0]?.message ?? "Invalid reason." };

  // Dynamic import for the same reason as lib/list-items/actions.ts's
  // anonymous path: lib/rate-limit.ts throws at module load if Upstash
  // isn't configured, and filing a report must never be able to take down
  // anything else in this file (there's only one function here today, but
  // the isolation habit matters more than the current blast radius).
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rateLimit = await checkRateLimit("reportsPerDay", user.id);
  if (!rateLimit.allowed) {
    return { error: "You've filed a few of these today already — try again tomorrow." };
  }

  const { error: insertError } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, list_item_id: listItemId, reason: parsedReason.data });
  if (insertError) return { error: "Couldn't file that." };

  await evaluateReportThreshold(listItemId);

  revalidatePath("/feed");
  return { ok: true };
}

// Runs after every new report on an item. Service role, because this needs
// to see ALL reports on the item and their reporters' account ages
// regardless of who's making the request — a regular user's RLS-scoped
// session can only see their own filed reports (reports_select_own in
// 0001_rls.sql), which structurally can't compute this.
async function evaluateReportThreshold(listItemId: string) {
  const admin = createServiceRoleClient();

  const { data: reports } = await admin
    .from("reports")
    .select("reporter_id, reason, reporter:profiles!reporter_id(created_at)")
    .eq("list_item_id", listItemId);

  if (!reports || reports.length < AUTO_HIDE_REPORT_COUNT) return;

  const distinctReporters = new Set(reports.map((r) => r.reporter_id));
  const distinctReasons = new Set(reports.map((r) => r.reason.trim().toLowerCase()).filter(Boolean));

  const ages = reports
    .map((r) => one(r.reporter)?.created_at)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  const ageSpread = ages.length > 0 ? Math.max(...ages) - Math.min(...ages) : 0;
  const reportersLookOrganic = ageSpread > SUSPICIOUS_ACCOUNT_AGE_SPREAD_MS;

  const meetsAutoHideBar =
    distinctReporters.size >= AUTO_HIDE_REPORT_COUNT &&
    distinctReasons.size >= AUTO_HIDE_REPORT_COUNT &&
    reportersLookOrganic;

  const { data: item } = await admin.from("list_items").select("review_state").eq("id", listItemId).maybeSingle();
  if (!item || !["approved", "flagged"].includes(item.review_state)) {
    // Already held/rejected/private/draft — nothing to do. In particular,
    // never re-hide something an admin already restored; that's the
    // reversibility guarantee actually meaning something.
    return;
  }

  if (meetsAutoHideBar) {
    await admin.from("list_items").update({ review_state: "held" }).eq("id", listItemId);
    await admin.from("moderation_log").insert({
      actor: "system",
      action: "auto_hide",
      target_type: "list_item",
      target_id: listItemId,
      reason: `Auto-hidden: ${distinctReporters.size} distinct reporters, ${distinctReasons.size} distinct reasons, account ages spread over ${Math.round(ageSpread / (24 * 60 * 60 * 1000))} days.`,
    });
  } else if (distinctReporters.size >= AUTO_HIDE_REPORT_COUNT) {
    // Enough raw reports to be worth a look, but doesn't clear the
    // organic-brigade bar — flag for admin attention WITHOUT pulling it
    // from public view. This is exactly what 'flagged' (vs 'held') exists
    // to express; see db/migrations/0006_safety_p6.sql.
    await admin.from("list_items").update({ review_state: "flagged" }).eq("id", listItemId);
    await admin.from("moderation_log").insert({
      actor: "system",
      action: "flag_for_review",
      target_type: "list_item",
      target_id: listItemId,
      reason: `${distinctReporters.size} reports, did not clear the auto-hide bar (reasons or account-age diversity too low) — flagged, not hidden.`,
    });
  }
}

const appealSchema = z.string().trim().min(10, "A bit more detail helps.").max(1000);

export type FileAppealResult = { error?: string; ok?: boolean };

// §7.1: "the hidden post's author is notified... and can submit one
// free-text appeal, which jumps the item to the top of the admin queue —
// the only queue-priority mechanism in the product." One appeal per item,
// enforced by appealed_at already being set.
export async function fileAppeal(listItemId: string, message: string): Promise<FileAppealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = appealSchema.safeParse(message);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid appeal." };

  const { data: item } = await supabase
    .from("list_items")
    .select("id, review_state, appealed_at")
    .eq("id", listItemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!item) return { error: "Couldn't find that item." };
  if (item.review_state !== "held") return { error: "Only hidden items can be appealed." };
  if (item.appealed_at) return { error: "You've already appealed this one." };

  const { error } = await supabase
    .from("list_items")
    .update({ appealed_at: new Date().toISOString() })
    .eq("id", listItemId)
    .eq("owner_id", user.id);
  if (error) return { error: "Couldn't file that appeal." };

  await createServiceRoleClient()
    .from("moderation_log")
    .insert({ actor: user.id, action: "appeal", target_type: "list_item", target_id: listItemId, reason: parsed.data });

  revalidatePath("/list");
  return { ok: true };
}
