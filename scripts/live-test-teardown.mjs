/*
 * Removes everything scripts/live-test-setup.mjs created on the live
 * database. Run it as soon as a walkthrough is finished — these are real
 * rows in the production project.
 *
 *   node --env-file=.env.local scripts/live-test-teardown.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

if (!fs.existsSync("./live-test.json")) {
  console.log("No live-test.json — nothing to tear down.");
  process.exit(0);
}

const t = JSON.parse(fs.readFileSync("./live-test.json", "utf8"));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Order matters: the ledger and membership rows reference profiles with
// ON DELETE RESTRICT, so they go before the users do.
if (t.groupId) {
  await admin.from("outing_expenses").delete().eq("group_id", t.groupId);
  await admin.from("outing_settlements").delete().eq("group_id", t.groupId);
  await admin.from("outing_group_members").delete().eq("group_id", t.groupId);
  await admin.from("outing_groups").delete().eq("id", t.groupId);
  console.log("removed outing group", t.groupId);
}

for (const user of t.users ?? []) {
  await admin.from("notifications").delete().eq("user_id", user.id);
  await admin.from("submissions").delete().eq("submitter_id", user.id);
  await admin.from("publish_invites").delete().eq("user_id", user.id);
  await admin.from("quest_interests").delete().eq("user_id", user.id);
  await admin.from("quest_votes").delete().eq("user_id", user.id);
  await admin.from("list_items").delete().eq("owner_id", user.id);
  await admin.from("profiles").delete().eq("id", user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  console.log(error ? `FAILED ${user.handle}: ${error.message}` : `removed ${user.handle}`);
}

fs.unlinkSync("./live-test.json");
console.log("done");
