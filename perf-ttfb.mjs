/*
 * Server-side TTFB, which is where the round-trip fan-out actually lives.
 *
 * Lighthouse-on-localhost cannot see this win clearly: it measures a page
 * whose Supabase latency profile is different from bom1 -> ap-southeast-1.
 * What IS comparable is how long the origin takes to produce the first byte
 * of a signed-in render, because every serial auth/profile round trip lands
 * inside that window.
 *
 *   node perf-ttfb.mjs http://localhost:3200 after
 *
 * Writes perf-out/<tag>-ttfb.json. Run the same command on either side of a
 * change; nothing else about the machine or the network may differ between
 * the two runs for the comparison to mean anything.
 */
import fs from "node:fs";

const { cookie } = JSON.parse(fs.readFileSync("./perf-session.json", "utf8"));
const BASE = process.argv[2] ?? "http://localhost:3200";
const TAG = process.argv[3] ?? "after";
const ROUTES = ["/list", "/feed", "/explore", "/boards", "/tonight", "/outings"];

// Enough samples that one slow cold start does not decide the answer, and
// the median rather than the mean for the same reason.
const SAMPLES = 12;
const WARMUP = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function timeOnce(url) {
  const started = performance.now();
  const res = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" });
  // First byte, not full body: read a single chunk and stop.
  const reader = res.body?.getReader();
  if (reader) {
    await reader.read();
    await reader.cancel();
  }
  return { ms: performance.now() - started, status: res.status };
}

const rows = [];
for (const route of ROUTES) {
  const url = `${BASE}${route}`;
  // Warm the route so compilation and connection setup are not measured.
  for (let i = 0; i < WARMUP; i++) await timeOnce(url);

  const samples = [];
  let status = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const result = await timeOnce(url);
    samples.push(result.ms);
    status = result.status;
  }

  const row = {
    route,
    status,
    medianMs: median(samples.map(Math.round)),
    minMs: Math.round(Math.min(...samples)),
    maxMs: Math.round(Math.max(...samples)),
  };
  rows.push(row);
  console.log(
    `${route.padEnd(10)} status ${row.status}  median ${String(row.medianMs).padStart(5)} ms  (min ${row.minMs}, max ${row.maxMs})`
  );
}

fs.mkdirSync("./perf-out", { recursive: true });
fs.writeFileSync(`./perf-out/${TAG}-ttfb.json`, JSON.stringify({ tag: TAG, base: BASE, samples: SAMPLES, rows }, null, 2));
console.log(`\nWrote perf-out/${TAG}-ttfb.json`);
