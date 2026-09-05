// Exercises register_quest_interest() as two real, previously-unconnected
// users through the anon client (so RLS and the SECURITY DEFINER boundary
// are both genuinely in the path), not via the service role.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: "./.env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const made = [];
async function makeUser(tag) {
  const email = `match-${tag}-${Date.now()}@ashoka.edu.in`;
  // Per-run throwaway credential, generated once and used for both the
  // create and the sign-in below. Never hardcode one here: this script
  // talks to the real project.
  const password = `${crypto.randomUUID()}aA1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  await admin.from("profiles").insert({
    id: data.user.id,
    handle: `m${tag}${Date.now()}`.slice(0, 18),
    avatar_seed: crypto.randomUUID(),
  });
  made.push(data.user.id);
  const client = createClient(URL, ANON);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, email, client };
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  const { data: quests } = await admin.from("quests").select("id").limit(2);
  const questA = quests[0].id;
  const questB = quests[1].id;

  const alice = await makeUser("a");
  const bob = await makeUser("b");

  // 1. First interest: registers, no match (nobody else wants it yet).
  const r1 = await alice.client.rpc("register_quest_interest", { p_quest_id: questA });
  check("first interest registers without matching", r1.data?.registered === true && r1.data?.matched === false, JSON.stringify(r1.data ?? r1.error?.message));

  // 2. Idempotency: a repeat tap must change nothing and notify nobody.
  const r2 = await alice.client.rpc("register_quest_interest", { p_quest_id: questA });
  check("repeat tap is idempotent", r2.data?.registered === false && r2.data?.reason === "already_live", JSON.stringify(r2.data));

  const { count: dupCount } = await admin
    .from("quest_interests").select("*", { count: "exact", head: true })
    .eq("quest_id", questA).eq("user_id", alice.id);
  check("repeat tap created no duplicate row", dupCount === 1, `rows=${dupCount}`);

  // 3. Second, unconnected user on the same quest -> match.
  const r3 = await bob.client.rpc("register_quest_interest", { p_quest_id: questA });
  check("second user matches", r3.data?.matched === true && !!r3.data?.group_id, JSON.stringify(r3.data ?? r3.error?.message));
  const groupId = r3.data?.group_id;

  // 4. Both sides notified.
  const { data: notes } = await admin.from("notifications").select("user_id,type,payload").eq("type", "match_found");
  const forPair = (notes ?? []).filter((n) => [alice.id, bob.id].includes(n.user_id));
  check("both users got match_found", forPair.length === 2, `notifications=${forPair.length}`);
  check("notification carries the group", forPair.every((n) => n.payload?.group_id === groupId), "");

  // 5. Group contains exactly the two of them.
  const { data: members } = await admin.from("outing_group_members").select("user_id").eq("group_id", groupId);
  const ids = (members ?? []).map((m) => m.user_id).sort();
  check("group contains both users", ids.length === 2 && ids.includes(alice.id) && ids.includes(bob.id), `members=${ids.length}`);

  // 6. Interests marked matched.
  const { data: states } = await admin.from("quest_interests").select("state").eq("quest_id", questA).in("user_id", [alice.id, bob.id]);
  check("both interests marked matched", (states ?? []).every((s) => s.state === "matched"), JSON.stringify(states));

  // 7. RLS: neither user can read the other's interest rows.
  const { data: aliceSees } = await alice.client.from("quest_interests").select("user_id");
  check("interest is private to its owner", (aliceSees ?? []).every((r) => r.user_id === alice.id), `visible=${(aliceSees ?? []).length}`);

  // 8. RLS: a non-member cannot see the group.
  const carol = await makeUser("c");
  const { data: carolSeesGroup } = await carol.client.from("outing_groups").select("id").eq("id", groupId);
  check("non-member cannot see the outing group", (carolSeesGroup ?? []).length === 0, `visible=${(carolSeesGroup ?? []).length}`);
  const { data: carolSeesNotes } = await carol.client.from("notifications").select("id");
  check("non-member cannot read others' notifications", (carolSeesNotes ?? []).length === 0, `visible=${(carolSeesNotes ?? []).length}`);

  // 9. Notifications cannot be forged by a user.
  const { error: forgeErr } = await carol.client.from("notifications").insert({ user_id: alice.id, type: "match_found", payload: {} });
  check("users cannot insert notifications", !!forgeErr, forgeErr?.code ?? "NO ERROR — insert succeeded");

  // 10. Blocks are absolute: a blocked pair must not match.
  await admin.from("blocks").insert({ blocker_id: alice.id, blocked_id: carol.id });
  await alice.client.rpc("register_quest_interest", { p_quest_id: questB });
  const rBlocked = await carol.client.rpc("register_quest_interest", { p_quest_id: questB });
  check("blocked users do not match", rBlocked.data?.matched === false, JSON.stringify(rBlocked.data));

  // 11. Instrumentation landed.
  const { data: evs } = await admin.from("events").select("event_name,metadata").in("event_name", ["interest_registered", "match_found", "outing_group_created"]).order("created_at", { ascending: false }).limit(20);
  const names = new Set((evs ?? []).map((e) => e.event_name));
  check("instrumented interest + match + group", names.has("interest_registered") && names.has("match_found") && names.has("outing_group_created"), [...names].join(","));
  const matchEv = (evs ?? []).find((e) => e.event_name === "match_found");
  check("time_to_match recorded", typeof matchEv?.metadata?.time_to_match_seconds === "number", String(matchEv?.metadata?.time_to_match_seconds));
} finally {
  for (const id of made) {
    await admin.from("quest_interests").delete().eq("user_id", id);
    await admin.from("outing_group_members").delete().eq("user_id", id);
    await admin.from("notifications").delete().eq("user_id", id);
    await admin.from("blocks").delete().or(`blocker_id.eq.${id},blocked_id.eq.${id}`);
    await admin.from("events").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  await admin.from("outing_groups").delete().eq("state", "active").is("id", null);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}
