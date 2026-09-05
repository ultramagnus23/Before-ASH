import "server-only";
import { getProvider } from "./provider";
import { EMBEDDING_DIM } from "@/db/schema";
import type { QuestTags, TagConfidence } from "@/lib/tags/dimensions";
import { TAG_SYSTEM_PROMPT, coerceTags } from "@/lib/tags/tag-prompt";

/*
 * The ONLY entry point for talking to an LLM anywhere in this codebase.
 * Per BUILD-PROMPT.md §14.1, this call carries the bare text being
 * classified/embedded/remixed and nothing else — no user id, item id,
 * handle, email, or timestamp. That's enforced by the type below: there is
 * no field on CallModelInput to put an identifier in, so passing one is a
 * compile error, not a runtime discipline someone has to remember.
 *
 * Model is an open-weight model served from LLM_API_URL. The wire format is
 * OpenAI-compatible, which every hosted open-weights provider speaks and
 * which Ollama also serves on its /v1 path — see providers/openai-compatible.ts
 * for why that swap was the fix for production having no moderation at all.
 * No Anthropic/OpenAI/any closed-model vendor SDK is used here or anywhere
 * else in the app.
 */

type CallModelInput =
  | { task: "moderate"; text: string }
  | { task: "embed"; text: string }
  | { task: "remix"; text: string; intensity: 1 | 2 | 3 }
  | { task: "segment"; text: string }
  | { task: "tag"; text: string; groupSize?: QuestTags["group_size"] };

export type ModerationScores = {
  names_person: number;
  sexual: number;
  harassment: number;
  dangerous: number;
  illegal: number;
  discriminatory: number;
};

type CallModelResult =
  | { task: "moderate"; scores: ModerationScores }
  | { task: "embed"; embedding: number[] }
  | { task: "remix"; variants: string[] }
  | { task: "segment"; items: string[] }
  | { task: "tag"; tags: QuestTags; confidence: TagConfidence };

class AiDisabledError extends Error {
  constructor() {
    super("AI_ENABLED is false — caller must fall back to non-AI behavior.");
    this.name = "AiDisabledError";
  }
}

// Logged fields are deliberately limited to task + timestamp — never the
// text, never an identifier. This is ops/cost telemetry, not a content log.
function logCall(task: CallModelInput["task"]) {
  console.log(JSON.stringify({ at: new Date().toISOString(), task, event: "llm_call" }));
}

async function moderate(text: string): Promise<ModerationScores> {
  const system = [
    "You are a content classifier for a university campus app. Score the",
    "user-submitted text on each dimension from 0 to 1. The text may be in",
    "English, Hindi, or Hinglish/transliterated Hindi — score it regardless",
    "of language or script.",
    "",
    "Dimensions:",
    "- names_person: does this name or unambiguously identify a specific,",
    "  living, non-public individual in a context that could embarrass,",
    "  expose, or target them?",
    "- sexual, harassment, dangerous, illegal, discriminatory: standard",
    "  content-safety dimensions, 0 = clearly absent, 1 = clearly present.",
    "",
    'Respond with ONLY a JSON object: {"names_person":0.0,"sexual":0.0,',
    '"harassment":0.0,"dangerous":0.0,"illegal":0.0,"discriminatory":0.0}',
  ].join("\n");

  return getProvider().json<ModerationScores>({
    system,
    user: text,
    temperature: 0,
  });
}

async function embed(text: string): Promise<number[]> {
  const embedding = await getProvider().embed(text);

  // Width is a hard contract with the quests.embedding column, which is
  // vector(768), and with search_quests_semantic's ::vector(768) cast.
  // Checking here turns "someone configured a 1024-dim embedding model"
  // into one obvious error instead of a Postgres dimension mismatch buried
  // inside a search fallback that silently degrades to keyword matching.
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding model returned ${embedding.length} dimensions, expected ${EMBEDDING_DIM}. ` +
        `Set LLM_EMBEDDING_MODEL_NAME to a ${EMBEDDING_DIM}-dim model, or migrate the ` +
        `vector column and re-embed every quest — the two must change together.`
    );
  }
  return embedding;
}

async function remix(text: string, intensity: 1 | 2 | 3): Promise<string[]> {
  const system = [
    "Rewrite the user's bucket-list item as 3 short variants at intensity",
    `level ${intensity} of 3 (1 = mild tweak, 3 = ambitious escalation).`,
    "Dry, second-person, no exclamation marks, no emoji.",
    'Respond with ONLY a JSON object: {"variants":["one","two","three"]}',
  ].join("\n");

  const { variants } = await getProvider().json<{ variants: string[] }>({
    system,
    user: text,
  });
  return Array.isArray(variants) ? variants : [];
}

// §13.2: bulk "smart paste" — splits free-form pasted text (a Notes app
// list, a WhatsApp message) into candidate item titles. Same minimal
// payload as every other task: the pasted text and nothing else. The
// result is a proposal, never committed directly — the caller
// (lib/import/actions.ts) always shows a preview before anything is saved.
async function segment(text: string): Promise<string[]> {
  // Note the object wrapper on every JSON task in this file: the
  // OpenAI-compatible `response_format: {type:"json_object"}` requires a
  // top-level OBJECT, and providers reject or mangle a bare array. The old
  // Ollama-native `format:"json"` allowed arrays, which is why these prompts
  // used to ask for one.
  const system = [
    "Split the user's free-form text into separate, individual",
    "to-do/bucket-list items. The text may be a Notes app list, a chat",
    "message, or just prose — find the discrete items in it. Each item",
    "should be a short, standalone phrase. Do not invent items that aren't",
    "in the text. If the text is already a single item, return one item.",
    'Respond with ONLY a JSON object: {"items":["item one","item two"]}',
  ].join("\n");

  const { items } = await getProvider().json<{ items: string[] }>({
    system,
    user: text,
    temperature: 0,
  });

  if (!Array.isArray(items)) return [];
  return items.filter((item) => typeof item === "string" && item.trim().length > 0);
}


// Task 2 catalog pre-tagging. The prompt and the response coercion live in
// lib/tags/tag-prompt.ts rather than here, because scripts/pretag-catalog.ts
// needs them too and cannot import this file (`server-only` throws outside
// Next's bundler). That is the exact shape of the bug that silently broke
// scripts/backfill-embeddings.ts when the wire format changed: two copies of
// one contract. There is one copy of this one.
async function tag(
  text: string,
  groupSize: QuestTags["group_size"]
): Promise<{ tags: QuestTags; confidence: TagConfidence }> {
  const raw = await getProvider().json<unknown>({
    system: TAG_SYSTEM_PROMPT,
    user: text,
    temperature: 0,
  });
  return coerceTags(raw, groupSize);
}

// Per-user quota (e.g. remix 5/day) is enforced by the CALLER against
// Upstash before invoking this function, keyed on the request's session
// user id — that id never enters this function, by design.
export async function callModel(input: CallModelInput): Promise<CallModelResult> {
  if (process.env.AI_ENABLED !== "true") {
    throw new AiDisabledError();
  }

  logCall(input.task);

  switch (input.task) {
    case "moderate":
      return { task: "moderate", scores: await moderate(input.text) };
    case "embed":
      return { task: "embed", embedding: await embed(input.text) };
    case "remix":
      return { task: "remix", variants: await remix(input.text, input.intensity) };
    case "segment":
      return { task: "segment", items: await segment(input.text) };
    case "tag":
      return { task: "tag", ...(await tag(input.text, input.groupSize ?? "any")) };
  }
}

export { AiDisabledError };
