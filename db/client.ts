import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

// Drizzle client for server-side reads/writes that don't need RLS (e.g. the
// seed loader, migrations, cron jobs) — uses the Supabase service role
// connection string. Request-scoped queries that must respect RLS go
// through lib/queries/*, which uses the Supabase JS client bound to the
// signed-in user's session instead of this pooled connection.
//
// Deliberately NO "server-only" import here, unlike lib/supabase/server.ts:
// this file's only consumer is scripts/seed.ts, run directly via `tsx`, not
// through Next.js's bundler — the real server-only package throws
// unconditionally outside that bundler (found live, running db:seed for
// the first time), and this file is never at risk of being imported into a
// client component since nothing in app/ or lib/ touches it.
const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
