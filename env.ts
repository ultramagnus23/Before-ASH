import { config } from "dotenv";

/*
 * Standalone Node scripts (db/migrate.ts, scripts/*.ts, tests/unit/*.test.ts)
 * don't get Next.js's automatic .env.local loading — that's a Next.js
 * dev-server/build-time behavior, not something plain `dotenv/config` does.
 * Every script that needs real credentials imports this instead of
 * `dotenv/config` directly, so `.env.local` (what README.md actually tells
 * people to create) gets picked up consistently everywhere, not just when
 * running `next dev`.
 *
 * Layering matches Next.js's own convention: .env first (defaults/shared),
 * .env.local second with override:true (actual secrets, gitignored).
 */
config({ path: ".env" });
config({ path: ".env.local", override: true });
