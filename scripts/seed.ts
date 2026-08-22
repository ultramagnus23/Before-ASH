import "../env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db/client";
import { quests } from "../db/schema";
import { sql } from "drizzle-orm";

// Standalone copy of lib/ai/call-model.ts's embed task, not an import of
// it: that file has `import "server-only"`, which throws unconditionally
// outside Next.js's bundler — found live, running this script directly via
// `tsx` for the first time. lib/ai/call-model.ts is used throughout the
// real app (moderation, remix) so it can't drop that guard the way
// db/client.ts safely could; duplicating this one task here is the
// smaller, safer tradeoff. Keep the §14.1 minimal-payload contract
// (text only) in sync with the real implementation if that ever changes.
async function embedForSeed(text: string): Promise<number[]> {
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

type SeedQuest = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: number;
  group_size: "solo" | "duo" | "group" | "any";
  locale: "campus" | "ncr" | "anywhere" | "any";
  spice: number;
  placeholder?: boolean;
};

type SeedFile = {
  _meta: { count: number };
  categories: { key: string; label: string; eyebrow: string }[];
  quests: SeedQuest[];
};

const BATCH_SIZE = 20;

async function main() {
  const raw = readFileSync(join(process.cwd(), "seed-quests.json"), "utf-8");
  const data = JSON.parse(raw) as SeedFile;

  const placeholders = data.quests.filter((q) => q.placeholder);
  if (placeholders.length > 0) {
    console.warn(
      `\n⚠ ${placeholders.length} catalog items still have placeholder:true — real Ashoka names have not been filled in.\n` +
        `See before-ash/BUILD-PROMPT.md §12.1 for the exact list. Loading them anyway with their generic\n` +
        `phrasing; replace and re-run the seed loader before launch.\n`
    );
  }

  const aiEnabled = process.env.AI_ENABLED === "true";
  if (!aiEnabled) {
    console.warn(
      "AI_ENABLED is not 'true' — seeding without embeddings. Semantic search on " +
        "/explore will fall back to trigram matching until embeddings are backfilled."
    );
  }

  let inserted = 0;
  for (let i = 0; i < data.quests.length; i += BATCH_SIZE) {
    const batch = data.quests.slice(i, i + BATCH_SIZE);

    const rows = await Promise.all(
      batch.map(async (q) => {
        let embedding: number[] | undefined;
        if (aiEnabled) {
          try {
            embedding = await embedForSeed(q.title);
          } catch (err) {
            console.error(`Embedding failed for ${q.id}, continuing without it:`, err);
          }
        }
        return {
          id: q.id,
          slug: q.slug,
          title: q.title,
          category: q.category,
          difficulty: q.difficulty,
          groupSize: q.group_size,
          locale: q.locale,
          spice: q.spice,
          isCustom: false,
          embedding,
        };
      })
    );

    await db
      .insert(quests)
      .values(rows)
      .onConflictDoUpdate({
        target: quests.id,
        set: {
          title: sql`excluded.title`,
          category: sql`excluded.category`,
          difficulty: sql`excluded.difficulty`,
          groupSize: sql`excluded.group_size`,
          locale: sql`excluded.locale`,
          spice: sql`excluded.spice`,
        },
      });

    inserted += rows.length;
    console.log(`Seeded ${inserted}/${data.quests.length}`);
  }

  console.log(`Done. ${inserted} quests loaded, ${placeholders.length} still need real campus names.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
