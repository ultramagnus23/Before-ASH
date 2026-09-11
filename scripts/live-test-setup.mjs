/*
 * Sets up a throwaway signed-in session against the LIVE deployment so the
 * authenticated routes can be walked in a browser.
 *
 * Everything it creates is private (visibility 'private', review_state
 * 'draft') so nothing reaches /feed, /q or any other public surface, and
 * scripts/live-test-teardown.mjs removes all of it.
 *
 *   node --env-file=.env.local scripts/live-test-setup.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const BASE = process.argv[2] ?? "https://before-ash.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const made = { users: [], groupId: null, base: BASE };

async function makeUser(tag) {
  const email = `livetest-${tag}-${stamp}@ashoka.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const handle = `livetest${tag}${stamp % 100000}`;
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, handle, avatar_seed: randomUUID() });
  if (profileError) throw profileError;
  made.users.push({ id: data.user.id, email, handle });
  return { id: data.user.id, email, handle };
}

const a = await makeUser("a");
const b = await makeUser("b");

// A small private list, so /list renders something real.
const { data: quests } = await admin.from("quests").select("id, category, slug, title").limit(8);
await admin.from("list_items").insert(
  quests.map((q, i) => ({
    owner_id: a.id,
    quest_id: q.id,
    category: q.category,
    visibility: "private",
    review_state: "draft",
    completed_at: i % 3 === 0 ? new Date().toISOString() : null,
  }))
);

// An outing group with both users, so /outings and split-cost have
// something to show without needing two live browser sessions.
const { data: group } = await admin
  .from("outing_groups")
  .insert({ quest_id: quests[0].id })
  .select("id")
  .single();
made.groupId = group.id;
await admin.from("outing_group_members").insert([
  { group_id: group.id, user_id: a.id },
  { group_id: group.id, user_id: b.id },
]);

// A match notification, so /notifications is not empty.
await admin.from("notifications").insert({
  user_id: a.id,
  type: "match_found",
  payload: { group_id: group.id, quest_id: quests[0].id },
});

// Invite A to submit, so /submit shows the form rather than the gate.
await admin.from("publish_invites").insert({ user_id: a.id });

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: a.email });
const confirmUrl = `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`;

fs.writeFileSync("./live-test.json", JSON.stringify({ ...made, quest: quests[0], confirmUrl }, null, 2));
console.log(JSON.stringify({ handleA: a.handle, handleB: b.handle, groupId: group.id, questSlug: quests[0].slug }, null, 2));
console.log("\nOpen this to sign in:\n" + confirmUrl);
