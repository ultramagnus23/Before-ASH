// Per-route client JS, derived from Next's own build manifest plus the real
// file sizes on disk. Not a substitute for @next/bundle-analyzer's
// module-level treemap (that needs the plugin, which is a new dependency),
// but it is exact for "which chunks does this route load and how big are
// they", which is what the JS-budget target in A.4 is actually measured on.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const manifest = JSON.parse(fs.readFileSync(".next/app-build-manifest.json", "utf8"));
const ROUTES = ["/list/page", "/explore/page", "/feed/page", "/boards/page", "/vote/page", "/page"];

const sizeOf = (f) => {
  const p = path.join(".next", f);
  if (!fs.existsSync(p)) return { raw: 0, gz: 0 };
  const buf = fs.readFileSync(p);
  return { raw: buf.length, gz: zlib.gzipSync(buf).length };
};

const out = {};
for (const route of ROUTES) {
  const files = (manifest.pages[route] ?? []).filter((f) => f.endsWith(".js"));
  const detailed = files
    .map((f) => ({ file: f.replace("static/chunks/", ""), ...sizeOf(f) }))
    .sort((a, b) => b.gz - a.gz);
  out[route] = {
    totalRawKb: +(detailed.reduce((s, d) => s + d.raw, 0) / 1024).toFixed(1),
    totalGzipKb: +(detailed.reduce((s, d) => s + d.gz, 0) / 1024).toFixed(1),
    chunkCount: detailed.length,
    largest: detailed.slice(0, 5).map((d) => ({
      file: d.file,
      rawKb: +(d.raw / 1024).toFixed(1),
      gzipKb: +(d.gz / 1024).toFixed(1),
    })),
  };
}
console.log(JSON.stringify(out, null, 2));
