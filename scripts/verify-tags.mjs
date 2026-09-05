/*
 * Task 2 verification, run through the ANON client wherever a user-facing
 * guarantee is being checked -- so RLS is genuinely in the path rather than
 * being asserted about. The service-role client is used only to set up state
 * and to inspect what a user is not allowed to see.
 *
 *   node --env-file=.env.local scripts/verify-tags.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
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

// ── proposals are invisible to users ──────────────────────────────────────
const { data: anonProposed } = await anon.from("quest_tags").select("quest_id").eq("state", "proposed");
check("anon cannot read proposed tags", (anonProposed ?? []).length === 0, `${anonProposed?.length} rows`);

const { data: adminProposed } = await admin.from("quest_tags").select("quest_id").eq("state", "proposed");
check("proposals exist for the service role to see", (adminProposed ?? []).length > 0);

// ── the write path is closed ──────────────────────────────────────────────
const someQuest = adminProposed?.[0]?.quest_id;
const { error: insertError } = await anon.from("quest_tags").insert({
  quest_id: someQuest,
  state: "reviewed",
  time_of_day: ["evening"],
  day_of_week: ["weekend"],
  duration: "under_1h",
  setting: "indoor",
  cost_band: "free",
  season: "any",
  group_size: "any",
});
check("anon cannot forge a reviewed tag", insertError !== null, insertError?.code ?? "no error");

// ── the database, not the code, is what guarantees "reviewed means human" ──
const { error: noReviewer } = await admin.from("quest_tags").insert({
  quest_id: someQuest,
  state: "reviewed",
  time_of_day: ["evening"],
  day_of_week: ["weekend"],
  duration: "under_1h",
  setting: "indoor",
  cost_band: "free",
  season: "any",
  group_size: "any",
  reviewed_by: null,
});
check(
  "a reviewed row without a reviewer is refused",
  noReviewer !== null && /quest_tags_reviewed_has_reviewer/.test(noReviewer?.message ?? ""),
  noReviewer?.message ?? "insert succeeded"
);

// ── empty arrays cannot silently drop an item out of Tonight ─────────────
const { error: emptyArray } = await admin.from("quest_tags").insert({
  quest_id: someQuest,
  state: "proposed",
  time_of_day: [],
  day_of_week: ["weekend"],
  duration: "under_1h",
  setting: "indoor",
  cost_band: "free",
  season: "any",
  group_size: "any",
});
check("an empty time_of_day is refused", emptyArray !== null, emptyArray?.message ?? "insert succeeded");

// ── one proposal per quest, so re-running the pass cannot fan out ────────
const { error: duplicate } = await admin.from("quest_tags").insert({
  quest_id: someQuest,
  state: "proposed",
  time_of_day: ["evening"],
  day_of_week: ["weekend"],
  duration: "under_1h",
  setting: "indoor",
  cost_band: "free",
  season: "any",
  group_size: "any",
});
check(
  "a second proposal for the same quest is refused",
  duplicate !== null && duplicate.code === "23505",
  duplicate?.code ?? "insert succeeded"
);

// ── the queue actually discriminates ──────────────────────────────────────
const { data: scores } = await admin
  .from("quest_tags")
  .select("min_confidence")
  .eq("state", "proposed");
const distinct = new Set((scores ?? []).map((r) => Number(r.min_confidence).toFixed(3)));
check(
  "the review queue has more than one distinct score to order by",
  distinct.size > 1,
  `${distinct.size} distinct values across ${scores?.length} rows`
);

// ── group_size was carried through, not re-invented ──────────────────────
const { data: joined } = await admin
  .from("quest_tags")
  .select("quest_id, group_size, quests(group_size)")
  .eq("state", "proposed");
const mismatched = (joined ?? []).filter((r) => r.group_size !== r.quests?.group_size);
check(
  "proposed group_size matches the curated catalog value",
  mismatched.length === 0,
  `${mismatched.length} mismatches`
);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
