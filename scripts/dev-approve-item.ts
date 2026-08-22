import "../env";
import { createServiceRoleClient } from "./_service-role-client";

/*
 * DEVELOPMENT-ONLY. Not part of the app's runtime code path.
 *
 * The real way an item's review_state reaches 'approved' is the three-layer
 * moderation pipeline (deterministic filter + LLM classifier + human review
 * for anonymous items) — that's P6. Until P6 exists, any item set to
 * visibility='public'/'anonymous' correctly sits in 'pending_auto' forever,
 * which means /feed, /u/[handle], and /q/[slug] have no legitimate way to
 * show anything yet. That's the CORRECT failure direction (fails closed),
 * not a bug — but it also means those pages can't be exercised end to end
 * without this script.
 *
 * Usage: npx tsx scripts/dev-approve-item.ts <list_item_id>
 *
 * Never call this from application code. When P6 ships the real
 * classifier, this script becomes redundant for its intended purpose —
 * keep it only if it's still useful as a manual override for support
 * requests, and if so, gate it behind ADMIN_HANDLES like every other admin
 * action, not behind "runs from a terminal."
 */
async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error("Usage: npx tsx scripts/dev-approve-item.ts <list_item_id>");
    process.exit(1);
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("list_items")
    .update({ review_state: "approved" })
    .eq("id", itemId)
    .neq("visibility", "private")
    .select("id, visibility, review_state")
    .maybeSingle();

  if (error) {
    console.error(error);
    process.exit(1);
  }

  if (!data) {
    console.error("No matching non-private item found for that id.");
    process.exit(1);
  }

  console.log("Approved for local testing:", data);
}

main();
