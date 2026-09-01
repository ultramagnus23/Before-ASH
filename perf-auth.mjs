// Captures a real signed-in cookie jar against the local production server
// so Lighthouse can measure the authenticated routes (/list, /explore,
// /feed, /boards) rather than the signed-out redirect to "/".
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import fs from "node:fs";

config({ path: "./.env.local" });

const BASE = process.argv[2] ?? "http://localhost:3200";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const email = `perf-baseline-${Date.now()}@ashoka.edu.in`;
const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (createErr) throw createErr;
const userId = created.user.id;
const handle = `perf${Date.now()}`.slice(0, 18);
await admin.from("profiles").insert({ id: userId, handle, avatar_seed: crypto.randomUUID() });

// Give the perf user a realistic list: A.3/A.2 both call out "/list with
// 60+ items" specifically, and an empty list would measure nothing.
const { data: quests } = await admin.from("quests").select("id, category").limit(60);
await admin.from("list_items").insert(
  quests.map((q, i) => ({
    owner_id: userId,
    quest_id: q.id,
    category: q.category,
    visibility: "private",
    review_state: "draft",
    completed_at: i % 3 === 0 ? new Date().toISOString() : null,
  }))
);

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const res = await fetch(
  `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`,
  { redirect: "manual" }
);

const setCookies = res.headers.getSetCookie();
// Keep only name=value; Lighthouse sends this back as a plain Cookie header.
const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

fs.writeFileSync(
  "./perf-session.json",
  JSON.stringify({ userId, handle, email, cookie, status: res.status, location: res.headers.get("location") }, null, 2)
);
console.log(JSON.stringify({ userId, handle, status: res.status, location: res.headers.get("location"), cookieCount: setCookies.length }));
