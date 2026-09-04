import "../env";
import { db } from "../db/client";
import { quests, EMBEDDING_DIM } from "../db/schema";
import { isNull, eq } from "drizzle-orm";

/*
 * Run with `--all` to re-embed EVERY quest, not just the ones missing a
 * vector. That mode is required whenever LLM_EMBEDDING_MODEL_NAME changes:
 * embeddings from two different models are not comparable even at identical
 * width, so a mixed catalog makes semantic search return confident nonsense
 * rather than failing. There is no way to detect this from the stored data,
 * which is exactly why it needs to be a deliberate flag.
 */
const REEMBED_ALL = process.argv.includes("--all");

// Standalone fetch call, not an import of lib/ai/call-model.ts, for the
// same reason scripts/seed.ts duplicates it: that file has
// `import "server-only"`, which throws unconditionally outside Next's
// bundler. Keep this in sync with lib/ai/call-model.ts's embed() task if
// that implementation ever changes — it drifted once already, when the
// provider moved from Ollama-native to the OpenAI-compatible wire format
// and this file kept POSTing /api/embeddings with a `prompt` field.
async function embedForBackfill(text: string): Promise<number[]> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env.LLM_API_KEY?.trim();
  if (key) headers.authorization = `Bearer ${key}`;

  const base = requireEnv("LLM_API_URL").replace(/\/+$/, "");
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: requireEnv("LLM_EMBEDDING_MODEL_NAME"), input: text }),
  });
  if (!res.ok) throw new Error(`Embedding call failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embedding = body.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding response contained no vector.");
  }
  return embedding;
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
    // Stop before writing anything if the width is wrong. Postgres would
    // reject each insert anyway, but one clear message beats 491 identical
    // dimension errors, and it names the actual fix.
    if (probe.length !== EMBEDDING_DIM) {
      console.error(
        `Model returned ${probe.length}-dim vectors, but quests.embedding is vector(${EMBEDDING_DIM}).`
      );
      console.error(
        `Pick a ${EMBEDDING_DIM}-dim embedding model, or migrate the column and re-embed together.`
      );
      process.exit(1);
    }
    console.log(`OK — embedding endpoint reachable, ${probe.length}-dim vectors.`);
  } catch (err) {
    console.error("Embedding endpoint is NOT reachable or the model isn't available:");
    console.error((err as Error).message);
    process.exit(1);
  }

  const pending = REEMBED_ALL
    ? await db.select({ id: quests.id, title: quests.title }).from(quests)
    : await db
        .select({ id: quests.id, title: quests.title })
        .from(quests)
        .where(isNull(quests.embedding));

  console.log(
    REEMBED_ALL
      ? `--all: re-embedding ${pending.length} quests (replacing existing vectors).`
      : `${pending.length} quests missing an embedding.`
  );
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
