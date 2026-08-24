import "../env";
import { db } from "../db/client";
import { quests } from "../db/schema";
import { isNull, eq } from "drizzle-orm";

// Standalone fetch call, not an import of lib/ai/call-model.ts, for the
// same reason scripts/seed.ts duplicates it: that file has
// `import "server-only"`, which throws unconditionally outside Next's
// bundler. Keep this in sync with lib/ai/call-model.ts's embed() task if
// that implementation ever changes.
async function embedForBackfill(text: string): Promise<number[]> {
  const res = await fetch(`${requireEnv("LLM_API_URL")}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: requireEnv("LLM_EMBEDDING_MODEL_NAME"), prompt: text }),
  });
  if (!res.ok) throw new Error(`Embedding call failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { embedding: number[] };
  return body.embedding;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

async function embedWithRetry(text: string, id: string): Promise<number[] | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await embedForBackfill(text);
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(`  embed failed for ${id} (attempt ${attempt}/${MAX_RETRIES}):`, (err as Error).message);
      if (isLast) return null;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

async function main() {
  if (process.env.AI_ENABLED !== "true") {
    console.error("AI_ENABLED is not 'true' — refusing to run. Set it and re-run.");
    process.exit(1);
  }

  // Fail loud before touching 491 rows, per the audit's finding that a
  // silent skip is exactly how the catalog ended up with 491 NULL
  // embeddings the first time.
  console.log(`Checking ${requireEnv("LLM_API_URL")} ...`);
  try {
    const probe = await embedForBackfill("connectivity probe");
    console.log(`OK — embedding endpoint reachable, ${probe.length}-dim vectors.`);
  } catch (err) {
    console.error("Embedding endpoint is NOT reachable or the model isn't available:");
    console.error((err as Error).message);
    process.exit(1);
  }

  const pending = await db
    .select({ id: quests.id, title: quests.title })
    .from(quests)
    .where(isNull(quests.embedding));

  console.log(`${pending.length} quests missing an embedding.`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  let done = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (q) => ({ id: q.id, embedding: await embedWithRetry(q.title, q.id) }))
    );

    for (const r of results) {
      if (!r.embedding) {
        failed++;
        continue;
      }
      await db.update(quests).set({ embedding: r.embedding }).where(eq(quests.id, r.id));
      done++;
    }

    console.log(`Progress: ${done + failed}/${pending.length} (${done} ok, ${failed} failed)`);
  }

  console.log(`\nDone. ${done} embedded, ${failed} failed.`);
  if (failed > 0) {
    console.log("Re-run this script to retry the failed rows — it only targets NULL embeddings.");
  }

  const remaining = await db.select({ id: quests.id }).from(quests).where(isNull(quests.embedding));
  console.log(`Remaining NULL embeddings in DB: ${remaining.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
