import { execFileSync } from "node:child_process";
import fs from "node:fs";

const { cookie } = JSON.parse(fs.readFileSync("./perf-session.json", "utf8"));
const BASE = process.argv[2] ?? "http://localhost:3200";
const TAG = process.argv[3] ?? "baseline";
const ROUTES = ["/list", "/explore", "/feed", "/boards"];

fs.mkdirSync("./perf-out", { recursive: true });
// Passed as a file, not an inline arg — the inline JSON gets mangled by the
// shell on Windows and Lighthouse then silently runs unauthenticated.
fs.writeFileSync("./perf-out/headers.json", JSON.stringify({ Cookie: cookie }));
const rows = [];

for (const route of ROUTES) {
  const out = `./perf-out/${TAG}${route.replace(/\//g, "_")}.json`;
  try {
    execFileSync(
      "npx",
      [
        "--yes", "lighthouse@12", `${BASE}${route}`,
        // Mobile form factor + simulated throttling are Lighthouse's
        // defaults; spelling them out here caused the arg mangling above.
        "--only-categories=performance",
        "--output=json", `--output-path=${out}`,
        "--extra-headers=./perf-out/headers.json",
        '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
        "--quiet",
      ],
      { stdio: ["ignore", "pipe", "pipe"], shell: true, timeout: 300000 }
    );
  } catch (e) {
    console.error(`FAILED ${route}: ${String(e.message).slice(0, 200)}`);
  }

  if (!fs.existsSync(out)) { rows.push({ route, error: "no report" }); continue; }
  const j = JSON.parse(fs.readFileSync(out, "utf8"));
  if (j.runtimeError) { rows.push({ route, error: j.runtimeError.code }); continue; }
  const a = j.audits;
  const scriptBytes = (a["network-requests"]?.details?.items ?? [])
    .filter((i) => i.resourceType === "Script")
    .reduce((s, i) => s + (i.transferSize ?? 0), 0);
  rows.push({
    route,
    score: Math.round((j.categories.performance.score ?? 0) * 100),
    fcp: a["first-contentful-paint"].numericValue,
    lcp: a["largest-contentful-paint"].numericValue,
    cls: a["cumulative-layout-shift"].numericValue,
    tbt: a["total-blocking-time"].numericValue,
    tti: a["interactive"]?.numericValue ?? null,
    scriptKb: Math.round(scriptBytes / 1024),
  });
}

fs.writeFileSync(`./perf-out/${TAG}-summary.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
