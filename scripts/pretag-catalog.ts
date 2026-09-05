import "../env";
import { db } from "../db/client";
import { quests, questTags } from "../db/schema";
import { sql, eq } from "drizzle-orm";
import { TAG_SYSTEM_PROMPT, coerceTags, scoreProposal } from "../lib/tags/tag-prompt";
import type { GroupSize } from "../lib/tags/dimensions";

/*
 * Task 2 -- propose tags for every catalog item.
 *
 * This is a BUILD-TIME pass. It writes rows with state='proposed', which no
 * user-facing query reads and RLS does not expose. A human promotes them in
 * /admin/tags. Nothing here can put a machine guess in front of a student,
 * and Tonight therefore works in production whether or not AI_ENABLED is
 * true there -- by the time a tag is readable, the model is long gone.
 *
 * Idempotent: proposals upsert on (quest_id, state), so re-running after a
 * crash costs time and nothing else. Already-reviewed items are skipped
 * entirely unless --all is passed -- re-proposing over finished human work
 * would be pure noise in the queue.
 *
 *   npm run pretag                 # untagged items only
 *   npm run pretag -- --all        # re-propose everything, reviewed included
 *   npm run pretag -- --limit 20   # a sample, for eyeballing the rubric
 */

const RETAG_ALL = process.argv.includes("--all");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null;

const MAX_RETRIES = 3;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/*
 * The transport, and the ONLY thing this file does not share with the app.
 * lib/ai/call-model.ts cannot be imported here (`server-only`), so the
 * prompt and the coercion are imported from lib/tags/tag-prompt.ts instead
 * and only the HTTP call is local. Keeping the drift surface down to "one
 * fetch" is deliberate: the last script that re-implemented a whole task
 * went stale without failing.
 */
async function askModel(text: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env.LLM_API_KEY?.trim();
  if (key) headers.authorization = `Bearer ${key}`;

  const base = requireEnv("LLM_API_URL").replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: requireEnv("LLM_MODEL_NAME"),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TAG_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Tag call failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Tag response had no content.");
  return JSON.parse(content);
}

async function tagWithRetry(text: string, id: string, groupSize: GroupSize) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return coerceTags(await askModel(text), groupSize);
    } catch (err) {
      console.error(`  tag failed for ${id} (${attempt}/${MAX_RETRIES}):`, (err as Error).message);
      if (attempt === MAX_RETRIES) return null;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

async function main() {
  // Reviewed rows are the thing worth protecting, so the skip list is built
  // from them rather than from proposals: a proposal that already exists is
  // cheap to overwrite, a reviewed row is a person's time.
  const reviewed = RETAG_ALL
    ? new Set<string>()
    : new Set(
        (await db.select({ id: questTags.questId }).from(questTags).where(eq(questTags.state, "reviewed"))).map(
          (r) => r.id
        )
      );

  const all = await db.select({ id: quests.id, title: quests.title, category: quests.category, groupSize: quests.groupSize }).from(quests);
  const todo = all.filter((q) => !reviewed.has(q.id)).slice(0, LIMIT ?? undefined);

  console.log(`${todo.length} items to tag (${reviewed.size} already reviewed, skipped).`);

  let ok = 0;
  let failed = 0;

  for (const [i, quest] of todo.entries()) {
    // Category is included because titles alone are frequently ambiguous
    // about cost and setting -- "the 3am one" reads very differently under
    // food than under academics.
    const text = `${quest.title} (category: ${quest.category.replace(/_/g, " ")})`;
    const result = await tagWithRetry(text, quest.id, quest.groupSize);

    if (!result) {
      failed++;
      continue;
    }

    const { tags, confidence } = result;
    // Not a plain minimum -- see scoreProposal() for why self-reported
    // confidence alone turned out to be a useless ordering key.
    const minConfidence = scoreProposal(tags, confidence);

    await db
      .insert(questTags)
      .values({
        questId: quest.id,
        state: "proposed",
        timeOfDay: tags.time_of_day,
        dayOfWeek: tags.day_of_week,
        duration: tags.duration,
        setting: tags.setting,
        costBand: tags.cost_band,
        season: tags.season,
        groupSize: tags.group_size,
        confidence,
        minConfidence,
        model: requireEnv("LLM_MODEL_NAME"),
      })
      .onConflictDoUpdate({
        target: [questTags.questId, questTags.state],
        set: {
          timeOfDay: sql`excluded.time_of_day`,
          dayOfWeek: sql`excluded.day_of_week`,
          duration: sql`excluded.duration`,
          setting: sql`excluded.setting`,
          costBand: sql`excluded.cost_band`,
          season: sql`excluded.season`,
          groupSize: sql`excluded.group_size`,
          confidence: sql`excluded.confidence`,
          minConfidence: sql`excluded.min_confidence`,
          model: sql`excluded.model`,
        },
      });

    ok++;
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${todo.length}...`);
  }

  console.log(`Done. ${ok} proposed, ${failed} failed.`);
  console.log("Nothing is live yet. Review at /admin/tags.");
  process.exit(failed > 0 ? 1 : 0);
}

void main();
