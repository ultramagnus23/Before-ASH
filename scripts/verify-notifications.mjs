/*
 * Verifies that all four notification types are actually delivered.
 *
 * Every real action here goes through the ANON client, so RLS and the
 * triggers run exactly as they do for a user. The service role is used only
 * to build fixtures and to read back what was written.
 *
 * The assertions are deliberately POSITIVE — "this person received this" —
 * not only negative. The outing_group_members recursion bug (0018) passed a
 * 15-check suite because every member-table assertion was negative, and a
 * policy that fails closed for everyone satisfies "a non-member cannot read
 * this" perfectly. Negative checks alone cannot tell working from broken.
 *
 *   node --env-file=.env.local scripts/verify-notifications.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const password = `T${randomUUID()}!a1`;
const created = [];

async function makeUser(tag) {
  const email = `notif-${tag}-${Date.now()}@ashoka.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    handle: `notif${tag}${Date.now() % 100000}`,
    avatar_seed: randomUUID(),
  });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function noticesFor(userId, type) {
  const { data } = await admin
    .from("notifications")
    .select("id, type, payload, read_at")
    .eq("user_id", userId)
    .eq("type", type);
  return data ?? [];
}

const boardIds = [];
const itemIds = [];
try {
  const owner = await makeUser("own");
  const asker = await makeUser("ask");
  const bystander = await makeUser("by");

  // ── connection_request ────────────────────────────────────────────────
  const questId = (await admin.from("quests").select("id").limit(1)).data[0].id;
  const { data: item, error: itemError } = await admin
    .from("list_items")
    .insert({
      owner_id: owner.id,
      quest_id: questId,
      category: "campus_ritual",
      visibility: "public",
      review_state: "approved",
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (itemError) throw itemError;
  itemIds.push(item.id);

  const { error: connError } = await asker.client.from("connections").insert({
    list_item_id: item.id,
    owner_id: owner.id,
    interested_id: asker.id,
    interested_accepted: true,
    owner_accepted: false,
  });
  check("a connection request can be made", connError === null, connError?.message);

  const requestNotices = await noticesFor(owner.id, "connection_request");
  check("the OWNER is told someone asked to connect", requestNotices.length === 1, `${requestNotices.length} rows`);
  check(
    "the asker is not told about their own request",
    (await noticesFor(asker.id, "connection_request")).length === 0
  );

  // ── connection_accepted ───────────────────────────────────────────────
  const { data: conn } = await admin
    .from("connections")
    .select("id")
    .eq("list_item_id", item.id)
    .eq("interested_id", asker.id)
    .single();

  const { data: accepted } = await owner.client
    .from("connections")
    .update({ owner_accepted: true })
    .eq("id", conn.id)
    .select("id");
  check("the owner can accept", (accepted ?? []).length === 1, "refused");

  const acceptNotices = await noticesFor(asker.id, "connection_accepted");
  check("the ASKER is told it was accepted", acceptNotices.length === 1, `${acceptNotices.length} rows`);
  check(
    "the owner is not told about their own acceptance",
    (await noticesFor(owner.id, "connection_accepted")).length === 0
  );

  // Re-saving an already-accepted row must not notify a second time.
  await admin.from("connections").update({ owner_accepted: true }).eq("id", conn.id);
  check(
    "re-saving an accepted connection does not notify again",
    (await noticesFor(asker.id, "connection_accepted")).length === 1
  );

  // ── re-expressing after a revoke is a fresh request ───────────────────
  // expressInterest() upserts, and on conflict resets owner_accepted to
  // false. That goes down the trigger's UPDATE branch, not INSERT, so it is
  // a separate path from the first request and needs its own assertion —
  // the migration's comment claims it, and an untested claim is a guess.
  await admin
    .from("connections")
    .update({ revoked_at: new Date().toISOString(), revoked_by: owner.id })
    .eq("id", conn.id);
  const beforeReask = (await noticesFor(owner.id, "connection_request")).length;

  const { error: reaskError } = await asker.client.from("connections").upsert(
    {
      list_item_id: item.id,
      owner_id: owner.id,
      interested_id: asker.id,
      interested_accepted: true,
      owner_accepted: false,
      revoked_at: null,
      revoked_by: null,
    },
    { onConflict: "list_item_id,interested_id" }
  );
  check("re-expressing interest after a revoke succeeds", reaskError === null, reaskError?.message);
  check(
    "re-expressing after a revoke notifies the owner afresh",
    (await noticesFor(owner.id, "connection_request")).length === beforeReask + 1,
    `${beforeReask} -> ${(await noticesFor(owner.id, "connection_request")).length}`
  );

  // An unrelated update to a row that is ALREADY pending must not re-notify.
  const beforeNoop = (await noticesFor(owner.id, "connection_request")).length;
  await admin.from("connections").update({ interested_accepted: true }).eq("id", conn.id);
  check(
    "an unrelated update to a pending request does not re-notify",
    (await noticesFor(owner.id, "connection_request")).length === beforeNoop
  );

  // ── board_activity ────────────────────────────────────────────────────
  const { data: board, error: boardError } = await admin
    .from("boards")
    .insert({ name: "Notif test board", created_by: owner.id })
    .select("id")
    .single();
  if (boardError) throw boardError;
  boardIds.push(board.id);

  // Checked, not ignored: a silently failed fixture insert is how a broken
  // feature ends up looking like a passing or failing one for the wrong
  // reason.
  const { error: membersError } = await admin.from("board_members").insert([
    { board_id: board.id, user_id: owner.id, role: "owner", status: "accepted" },
    { board_id: board.id, user_id: asker.id, role: "contributor", status: "accepted" },
    { board_id: board.id, user_id: bystander.id, role: "viewer", status: "invited" },
  ]);
  if (membersError) throw membersError;

  const { error: addError } = await owner.client.from("board_items").insert({
    board_id: board.id,
    quest_id: questId,
    category: "campus_ritual",
    added_by: owner.id,
  });
  check("a board item can be added", addError === null, addError?.message);

  const activityNotices = await noticesFor(asker.id, "board_activity");
  check("an accepted member is told about board activity", activityNotices.length === 1, `${activityNotices.length} rows`);
  check(
    "the person who added it is not told",
    (await noticesFor(owner.id, "board_activity")).length === 0
  );
  check(
    "a member who has not accepted their invite is not told",
    (await noticesFor(bystander.id, "board_activity")).length === 0
  );

  // Collapsing: a second item while the first notice is still unread must
  // not produce a second row.
  await owner.client.from("board_items").insert({
    board_id: board.id,
    quest_id: questId,
    category: "campus_ritual",
    added_by: owner.id,
  });
  check(
    "a second item does not stack a second unread notice",
    (await noticesFor(asker.id, "board_activity")).length === 1
  );

  // Once read, a later item is worth telling them about again.
  await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", asker.id);
  await owner.client.from("board_items").insert({
    board_id: board.id,
    quest_id: questId,
    category: "campus_ritual",
    added_by: owner.id,
  });
  check(
    "after reading, new activity notifies again",
    (await noticesFor(asker.id, "board_activity")).length === 2
  );

  // ── the recipient can actually read it, through RLS ───────────────────
  const { data: ownRead } = await owner.client.from("notifications").select("id, type");
  check("a recipient can read their own notices through RLS", (ownRead ?? []).length > 0, `${ownRead?.length} rows`);

  const { data: snoop } = await bystander.client.from("notifications").select("id").eq("user_id", owner.id);
  check("nobody can read someone else's notices", (snoop ?? []).length === 0, `${snoop?.length} rows`);

  // ── forgery is still refused ──────────────────────────────────────────
  const { error: forge } = await asker.client.from("notifications").insert({
    user_id: owner.id,
    type: "board_activity",
    payload: {},
  });
  check("a user cannot write a notification directly", forge !== null, "accepted");
} finally {
  for (const id of boardIds) await admin.from("boards").delete().eq("id", id);
  for (const id of itemIds) await admin.from("list_items").delete().eq("id", id);
  for (const id of created) {
    await admin.from("notifications").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
