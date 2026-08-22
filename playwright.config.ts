import "./env";
import { defineConfig } from "@playwright/test";

// Loading .env.local here (config evaluates before any test file) means
// every spec under tests/e2e/ sees the same real env vars this session's
// direct-node connectivity checks used, without each spec file needing its
// own dotenv import — same gap as db/migrate.ts and scripts/*.ts had; see
// env.ts's comment for why plain `dotenv/config` doesn't cover this.

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // e2e tests create/delete real auth users; avoid cross-test collisions
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    // Next.js dev mode compiles routes on demand on first request, not at
    // server startup — `next dev` itself reports "Ready" in ~5s (confirmed
    // directly), but the FIRST real request through middleware + a
    // route's on-demand compile can take longer than that. 60s wasn't
    // enough on a cold run; found by hitting the actual timeout, not by
    // guessing a bigger number preemptively.
    timeout: 120_000,
  },
});
