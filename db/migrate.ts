import "../env";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * Applies every .sql file in db/migrations, in order, tracking which ones
 * have already run in a ledger table — WITHOUT this, re-running the script
 * (e.g. after fixing one broken migration, which is exactly what happened
 * getting 0003_auth_domain_restriction.sql working against a real Supabase
 * project) re-attempts every already-applied file from 0000 onward, and
 * fails immediately on the first non-idempotent statement (CREATE TYPE,
 * CREATE TABLE) that already succeeded last time. This gap was invisible
 * until this migration set was actually run against a real, stateful
 * database more than once.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  await sql`
    create table if not exists _sql_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const alreadyApplied = new Set(
    (await sql<{ filename: string }[]>`select filename from _sql_migrations`).map((r) => r.filename)
  );

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      console.log(`Skipping ${file} (already applied).`);
      continue;
    }
    console.log(`Applying ${file}...`);
    const contents = readFileSync(join(dir, file), "utf-8");
    await sql.unsafe(contents);
    await sql`insert into _sql_migrations (filename) values (${file})`;
  }

  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
