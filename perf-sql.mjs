// EXPLAIN ANALYZE on the real queries behind /list, /feed and /boards/[id],
// per A.2's "check the actual queries" — including the P8 double-nested
// board_items -> item_posts -> profiles embed it flags as the likeliest
// index offender.
import postgres from "postgres";
import { config } from "dotenv";
import fs from "node:fs";

config({ path: "./.env.local" });
const { userId } = JSON.parse(fs.readFileSync("./perf-session.json", "utf8"));

// Never inline a connection string here. The direct DATABASE_URL in
// .env.local resolves to an IPv6-only host that some networks can't reach;
// if that's your case, set PERF_DATABASE_URL to the pooler string
// (aws-0-<region>.pooler.supabase.com:6543) for this script only.
const connectionString = process.env.PERF_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set PERF_DATABASE_URL (or DATABASE_URL) before running this.");
}
const sql = postgres(connectionString, { max: 1, prepare: false });

const QUERIES = {
  "/list — own rows + quest join": `
    select li.id, li.quest_id, li.custom_title, li.category, li.visibility,
           li.review_state, li.note, li.proof, li.completed_at, li.created_at, q.title
    from list_items li left join quests q on q.id = li.quest_id
    where li.owner_id = '${userId}' order by li.created_at desc`,
  "/list — item_posts for those rows": `
    select ip.* from item_posts ip
    where ip.list_item_id in (select id from list_items where owner_id = '${userId}')`,
  "/feed — public approved page": `
    select li.id, li.category, li.custom_title, li.proof, li.completed_at,
           li.visibility, li.owner_id, q.title, p.handle
    from list_items li
    left join quests q on q.id = li.quest_id
    join profiles p on p.id = li.owner_id
    where li.completed_at is not null
      and li.visibility in ('public','anonymous') and li.review_state = 'approved'
    order by li.completed_at desc limit 21`,
  "/boards/[id] — nested board_items -> item_posts -> profiles": `
    select bi.*, q.title, ip.id as post_id, ip.body, pa.handle as author_handle
    from board_items bi
    left join quests q on q.id = bi.quest_id
    left join item_posts ip on ip.board_item_id = bi.id
    left join profiles pa on pa.id = ip.author_id
    order by bi.created_at desc`,
  "quest_open_counts()": `select * from quest_open_counts()`,
  "quest_add_counts()": `select * from quest_add_counts()`,
  "quest_vote_counts()": `select * from quest_vote_counts()`,
};

const out = {};
for (const [label, q] of Object.entries(QUERIES)) {
  try {
    const rows = await sql.unsafe(`explain (analyze, buffers, format json) ${q}`);
    const plan = rows[0]["QUERY PLAN"][0];
    const flat = JSON.stringify(plan.Plan);
    out[label] = {
      executionMs: +plan["Execution Time"].toFixed(2),
      planningMs: +plan["Planning Time"].toFixed(2),
      seqScans: (flat.match(/"Node Type":"Seq Scan"/g) || []).length,
      indexScans: (flat.match(/"Node Type":"Index[^"]*Scan"/g) || []).length,
      seqScanTables: [...flat.matchAll(/"Node Type":"Seq Scan","Parallel Aware":[^,]+,"Async Capable":[^,]+,"Relation Name":"([^"]+)"/g)].map((m) => m[1]),
    };
  } catch (e) {
    out[label] = { error: String(e.message).slice(0, 160) };
  }
}
console.log(JSON.stringify(out, null, 2));
await sql.end({ timeout: 2 });
