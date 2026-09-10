/*
 * Task 4 verification.
 *
 * Two real users in a real outing group, driven through the ANON client so
 * RLS and the SECURITY DEFINER boundary are genuinely in the path. The
 * service role is used only to build the fixture and to inspect what a user
 * is not allowed to see.
 *
 *   node --env-file=.env.local scripts/verify-split.mjs
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
  const email = `split-${tag}-${Date.now()}@ashoka.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  // Errors on fixture setup are thrown, not ignored. A silently failed
  // profile insert cascaded into "a member cannot record an expense" and
  // looked exactly like an RLS bug in the feature under test.
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    handle: `split${tag}${Date.now() % 100000}`,
    avatar_seed: randomUUID(),
  });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

let groupId;
try {
  const a = await makeUser("a");
  const b = await makeUser("b");
  const outsider = await makeUser("c");

  const questId = (await admin.from("quests").select("id").limit(1)).data[0].id;
  groupId = (await admin.from("outing_groups").insert({ quest_id: questId }).select("id").single()).data.id;
  const { error: memberError } = await admin.from("outing_group_members").insert([
    { group_id: groupId, user_id: a.id },
    { group_id: groupId, user_id: b.id },
  ]);
  if (memberError) throw memberError;

  // ── recording an expense ───────────────────────────────────────────────
  // 101 paise between two people does not divide. The shares must still sum
  // to exactly 101.
  const shares = [
    { userId: a.id, sharePaise: 51 },
    { userId: b.id, sharePaise: 50 },
  ];
  const { error: expenseError } = await a.client.rpc("record_outing_expense", {
    p_group_id: groupId,
    p_payer_id: a.id,
    p_amount_paise: 101,
    p_description: "chai",
    p_shares: shares,
  });
  check("a member can record an expense", expenseError === null, expenseError?.message);

  // ── the invariant, enforced at the point of entry ──────────────────────
  const { error: mismatchError } = await a.client.rpc("record_outing_expense", {
    p_group_id: groupId,
    p_payer_id: a.id,
    p_amount_paise: 100,
    p_description: "bad split",
    p_shares: [{ userId: a.id, sharePaise: 40 }, { userId: b.id, sharePaise: 40 }],
  });
  check("shares that do not sum to the amount are refused", mismatchError !== null, "accepted");

  // ── membership boundaries ──────────────────────────────────────────────
  const { error: outsiderWrite } = await outsider.client.rpc("record_outing_expense", {
    p_group_id: groupId,
    p_payer_id: outsider.id,
    p_amount_paise: 100,
    p_description: "gatecrash",
    p_shares: [{ userId: outsider.id, sharePaise: 100 }],
  });
  check("a non-member cannot record an expense", outsiderWrite !== null, "accepted");

  const { error: nonMemberShare } = await a.client.rpc("record_outing_expense", {
    p_group_id: groupId,
    p_payer_id: a.id,
    p_amount_paise: 100,
    p_description: "split with a stranger",
    p_shares: [{ userId: outsider.id, sharePaise: 100 }],
  });
  check("an expense cannot be split with a non-member", nonMemberShare !== null, "accepted");

  const { data: outsiderRead } = await outsider.client
    .from("outing_expenses")
    .select("id")
    .eq("group_id", groupId);
  check("a non-member cannot read the ledger", (outsiderRead ?? []).length === 0, `${outsiderRead?.length} rows`);

  const { data: memberRead } = await b.client.from("outing_expenses").select("id").eq("group_id", groupId);
  check("the other member can read the ledger", (memberRead ?? []).length === 1, `${memberRead?.length} rows`);

  // ── append-only ────────────────────────────────────────────────────────
  const expenseId = memberRead[0].id;
  const { data: updated } = await a.client
    .from("outing_expenses")
    .update({ amount_paise: 1 })
    .eq("id", expenseId)
    .select("id");
  check("an expense cannot be edited after the fact", (updated ?? []).length === 0, "update applied");

  const { data: deleted } = await a.client.from("outing_expenses").delete().eq("id", expenseId).select("id");
  check("an expense cannot be deleted", (deleted ?? []).length === 0, "delete applied");

  // ── two-sided settle-up ────────────────────────────────────────────────
  const { data: settlement, error: settleError } = await b.client
    .from("outing_settlements")
    .insert({ group_id: groupId, from_id: b.id, to_id: a.id, amount_paise: 50 })
    .select("id, confirmed_at")
    .single();
  check("a member can record that they paid someone", settleError === null, settleError?.message);
  check("a new settlement starts unconfirmed", settlement?.confirmed_at === null);

  const { error: forgeError } = await b.client
    .from("outing_settlements")
    .insert({ group_id: groupId, from_id: a.id, to_id: b.id, amount_paise: 999 });
  check("you cannot claim someone else paid you", forgeError !== null, "accepted");

  const { data: selfConfirm } = await b.client
    .from("outing_settlements")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", settlement.id)
    .select("id");
  check("the payer cannot confirm their own payment", (selfConfirm ?? []).length === 0, "confirmed");

  const { data: recipientConfirm } = await a.client
    .from("outing_settlements")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", settlement.id)
    .select("id");
  check("the recipient can confirm it", (recipientConfirm ?? []).length === 1, "refused");

  // ── the ledger adds up ─────────────────────────────────────────────────
  const { data: finalExpenses } = await admin
    .from("outing_expenses")
    .select("amount_paise, payer_id, outing_expense_shares(user_id, share_paise)")
    .eq("group_id", groupId);
  const { data: finalSettlements } = await admin
    .from("outing_settlements")
    .select("from_id, to_id, amount_paise")
    .eq("group_id", groupId)
    .not("confirmed_at", "is", null);

  const net = new Map();
  const add = (id, amount) => net.set(id, (net.get(id) ?? 0) + amount);
  for (const e of finalExpenses) {
    add(e.payer_id, Number(e.amount_paise));
    for (const s of e.outing_expense_shares) add(s.user_id, -Number(s.share_paise));
  }
  for (const s of finalSettlements) {
    add(s.from_id, Number(s.amount_paise));
    add(s.to_id, -Number(s.amount_paise));
  }
  const total = [...net.values()].reduce((x, y) => x + y, 0);
  check("balances sum to exactly zero", total === 0, `sum=${total}`);
  check(
    "every balance is a whole number of paise",
    [...net.values()].every((v) => Number.isInteger(v))
  );

  const shareSum = finalExpenses[0].outing_expense_shares.reduce((s, r) => s + Number(r.share_paise), 0);
  check("an indivisible amount still splits exactly", shareSum === 101, `sum=${shareSum}`);
} finally {
  if (groupId) await admin.from("outing_groups").delete().eq("id", groupId);
  for (const id of created) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
