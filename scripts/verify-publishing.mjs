/*
 * Task 6 verification.
 *
 * Driven through the ANON client so the invite gate and the submission
 * privacy rules are genuinely enforced by RLS rather than asserted about.
 *
 *   node --env-file=.env.local scripts/verify-publishing.mjs
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
  const email = `pub-${tag}-${Date.now()}@ashoka.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    handle: `pub${tag}${Date.now() % 100000}`,
    avatar_seed: randomUUID(),
  });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

const submissionIds = [];
try {
  const invited = await makeUser("in");
  const uninvited = await makeUser("out");

  // ── the invite gate ────────────────────────────────────────────────────
  const { error: beforeInvite } = await invited.client.from("submissions").insert({
    submitter_id: invited.id,
    title: "A thing worth doing on campus",
    category: "campus_ritual",
    review_state: "pending_auto",
  });
  check("an uninvited user cannot submit", beforeInvite !== null, "accepted");

  await admin.from("publish_invites").insert({ user_id: invited.id });

  const { data: afterInvite, error: afterError } = await invited.client
    .from("submissions")
    .insert({
      submitter_id: invited.id,
      title: "A thing worth doing on campus",
      category: "campus_ritual",
      review_state: "pending_auto",
    })
    .select("id, review_state, published_quest_id")
    .single();
  check("an invited user can submit", afterError === null, afterError?.message);
  if (afterInvite) submissionIds.push(afterInvite.id);

  // ── you cannot submit yourself straight into the catalog ───────────────
  const { error: preApproved } = await invited.client.from("submissions").insert({
    submitter_id: invited.id,
    title: "Straight to the front of the queue",
    category: "campus_ritual",
    review_state: "approved",
  });
  check("a submission cannot be inserted pre-approved", preApproved !== null, "accepted");

  const { error: forSomeoneElse } = await invited.client.from("submissions").insert({
    submitter_id: uninvited.id,
    title: "Submitted on someone else's behalf",
    category: "campus_ritual",
    review_state: "pending_auto",
  });
  check("you cannot submit as someone else", forSomeoneElse !== null, "accepted");

  // ── submissions are private to their submitter ─────────────────────────
  const { data: othersView } = await uninvited.client.from("submissions").select("id");
  check("nobody can read another person's submissions", (othersView ?? []).length === 0, `${othersView?.length} rows`);

  const { data: ownView } = await invited.client.from("submissions").select("id");
  check("you can read your own", (ownView ?? []).length >= 1, `${ownView?.length} rows`);

  // ── the queue is not user-writable ─────────────────────────────────────
  const { data: selfApprove } = await invited.client
    .from("submissions")
    .update({ review_state: "approved" })
    .eq("id", afterInvite.id)
    .select("id");
  check("you cannot approve your own submission", (selfApprove ?? []).length === 0, "approved");

  const { data: selfDelete } = await invited.client
    .from("submissions")
    .delete()
    .eq("id", afterInvite.id)
    .select("id");
  check("submissions cannot be deleted by their submitter", (selfDelete ?? []).length === 0, "deleted");

  // ── the invite list is not a visible in-group ──────────────────────────
  const { data: inviteSnoop } = await uninvited.client.from("publish_invites").select("user_id");
  check("you cannot see who else is invited", (inviteSnoop ?? []).length === 0, `${inviteSnoop?.length} rows`);

  const { data: ownInvite } = await invited.client.from("publish_invites").select("user_id");
  check("you can see your own invite", (ownInvite ?? []).length === 1, `${ownInvite?.length} rows`);

  // ── the approved-must-be-linked invariant ──────────────────────────────
  const { error: danglingApproval } = await admin
    .from("submissions")
    .update({ review_state: "approved" })
    .eq("id", afterInvite.id);
  check(
    "an approved submission must point at what it became",
    danglingApproval !== null && /submissions_published_link/.test(danglingApproval?.message ?? ""),
    danglingApproval?.message ?? "accepted"
  );

  // ── no image may reach a published surface ─────────────────────────────
  // Structural, not procedural: the columns do not exist. callModel is
  // text-only by contract, so an image on a published surface could not be
  // screened even in principle -- this asserts the surface stays without one.
  for (const [table, column] of [
    ["submissions", "image_url"],
    ["quests", "image_url"],
    ["submissions", "photo"],
    ["quests", "photo"],
  ]) {
    const { error } = await admin.from(table).select(column).limit(1);
    check(
      `${table} has no ${column} column`,
      error !== null && /column|does not exist/i.test(error?.message ?? ""),
      "column exists"
    );
  }
} finally {
  for (const id of submissionIds) await admin.from("submissions").delete().eq("id", id);
  for (const id of created) {
    await admin.from("submissions").delete().eq("submitter_id", id);
    await admin.from("publish_invites").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
