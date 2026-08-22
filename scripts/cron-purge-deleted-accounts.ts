import "../env";
import { createServiceRoleClient } from "./_service-role-client";

/*
 * §8: DELETE /account hard-deletes with cascade after a 30-day recovery
 * window. This script is the part that actually performs the hard delete —
 * wire it to run daily via Vercel Cron (vercel.json `crons`) or Supabase's
 * pg_cron. Deleting the auth.users row cascades to `profiles` (and from
 * there to list_items, boards, etc. via the onDelete: 'cascade' foreign
 * keys in db/schema.ts) — this is the actual erasure-right fulfillment for
 * DPDP compliance (§8.1), not a soft flag.
 */
async function main() {
  const supabase = createServiceRoleClient();

  const { data: expired, error } = await supabase
    .from("account_deletion_requests")
    .select("id, user_id, expires_at")
    .lt("expires_at", new Date().toISOString());

  if (error) throw error;

  console.log(`Found ${expired?.length ?? 0} accounts past their recovery window.`);

  for (const row of expired ?? []) {
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(row.user_id);
    if (deleteErr) {
      console.error(`Failed to delete user ${row.user_id}:`, deleteErr);
      continue;
    }
    await supabase.from("account_deletion_requests").delete().eq("id", row.id);
    console.log(`Deleted user ${row.user_id}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
