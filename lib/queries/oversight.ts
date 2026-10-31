import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/*
 * Read-only aggregates for the oversight pages. Callers MUST have passed
 * checkOversightAccess() first (the (oversight) layout does) — this uses the
 * service-role client. Everything returned is a count or an admin-side audit
 * row: no emails, no list-item text, no anonymous authors.
 */

const DAY = 24 * 60 * 60 * 1000;
const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountFilter = (q: any) => any;

async function count(table: string, filter?: CountFilter): Promise<number> {
  const supabase = createServiceRoleClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return n ?? 0;
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;

export async function getOverview() {
  const supabase = createServiceRoleClient();

  const [
    members,
    newMembers7d,
    newMembers30d,
    activeEvents7d,
    listItems,
    stamped,
    awaitingHuman,
    held,
    flagged,
    reports7d,
    reportsTotal,
    blocks,
    pendingDeletions,
    modActions7d,
    reveals,
    errors24h,
    errors7d,
    oldestPending,
  ] = await Promise.all([
    count("profiles"),
    count("profiles", (q) => q.gte("created_at", since(7))),
    count("profiles", (q) => q.gte("created_at", since(30))),
    supabase.from("events").select("user_id").gte("created_at", since(7)).not("user_id", "is", null).limit(10000),
    count("list_items"),
    count("list_items", (q) => q.not("completed_at", "is", null)),
    count("list_items", (q) => q.eq("review_state", "pending_human")),
    count("list_items", (q) => q.eq("review_state", "held")),
    count("list_items", (q) => q.eq("review_state", "flagged")),
    count("reports", (q) => q.gte("created_at", since(7))),
    count("reports"),
    count("blocks"),
    count("account_deletion_requests"),
    count("moderation_log", (q) => q.gte("created_at", since(7))),
    count("identity_reveals"),
    count("events", (q) => q.eq("event_name", "server_error").gte("created_at", since(1))),
    count("events", (q) => q.eq("event_name", "server_error").gte("created_at", since(7))),
    supabase
      .from("list_items")
      .select("created_at")
      .in("review_state", ["pending_human", "held", "flagged"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeUsers7d = new Set((activeEvents7d.data ?? []).map((r) => r.user_id as string)).size;
  const oldestIso = oldestPending.data?.created_at as string | undefined;

  return {
    members,
    newMembers7d,
    newMembers30d,
    activeUsers7d,
    listItems,
    stamped,
    review: {
      awaitingHuman,
      held,
      flagged,
      oldestWaitingDays: oldestIso ? Math.floor((Date.now() - new Date(oldestIso).getTime()) / DAY) : null,
    },
    safety: { reports7d, reportsTotal, blocks, pendingDeletions, modActions7d, reveals },
    system: { errors24h, errors7d },
    generatedAt: new Date().toISOString(),
  };
}

export type AuditRow = {
  at: string;
  source: "moderation" | "identity_reveal";
  actor: string;
  action: string;
  target: string;
  reason: string | null;
};

/*
 * Merged audit trail: moderation_log + identity_reveals. For reveals we show
 * who revealed and why, never WHO was revealed — oversight can see that the
 * power was used and judge the reason, without becoming a second unmasking path.
 */
export async function getAuditTrail(limit = 100): Promise<AuditRow[]> {
  const supabase = createServiceRoleClient();
  const [mod, rev] = await Promise.all([
    supabase
      .from("moderation_log")
      .select("created_at, actor, action, target_type, target_id, reason")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("identity_reveals")
      .select("created_at, admin_id, reason, list_item_id")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (mod.error) throw new Error(mod.error.message);
  if (rev.error) throw new Error(rev.error.message);

  const actorIds = new Set<string>();
  for (const r of mod.data ?? []) if (r.actor !== "system") actorIds.add(r.actor);
  for (const r of rev.data ?? []) actorIds.add(r.admin_id);
  const handles = new Map<string, string>();
  if (actorIds.size) {
    const { data } = await supabase.from("profiles").select("id, handle").in("id", [...actorIds]);
    for (const p of data ?? []) handles.set(p.id, p.handle);
  }
  const name = (id: string) => (id === "system" ? "system" : `@${handles.get(id) ?? "deleted-user"}`);

  const rows: AuditRow[] = [
    ...(mod.data ?? []).map((r) => ({
      at: r.created_at as string,
      source: "moderation" as const,
      actor: name(r.actor),
      action: r.action as string,
      target: `${r.target_type} ${String(r.target_id).slice(0, 8)}`,
      reason: r.reason as string | null,
    })),
    ...(rev.data ?? []).map((r) => ({
      at: r.created_at as string,
      source: "identity_reveal" as const,
      actor: name(r.admin_id),
      action: "identity_reveal",
      target: `list_item ${String(r.list_item_id).slice(0, 8)}`,
      reason: r.reason as string | null,
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
