import "server-only";

/*
 * The ONLY entry point for talking to an LLM anywhere in this codebase.
 * Per BUILD-PROMPT.md §14.1, this call carries the bare text being
 * classified/embedded/remixed and nothing else — no user id, item id,
 * handle, email, or timestamp. That's enforced by the type below: there is
 * no field on CallModelInput to put an identifier in, so passing one is a
 * compile error, not a runtime discipline someone has to remember.
 *
 * Model is an open-weight model served from LLM_API_URL (Ollama by default,
 * or any OpenAI-compatible endpoint you control). No Anthropic/OpenAI/any
 * closed-model vendor SDK is used here or anywhere else in the app.
 */

type CallModelInput =
  | { task: "moderate"; text: string }
  | { task: "embed"; text: string }
  | { task: "remix"; text: string; intensity: 1 | 2 | 3 }
  | { task: "segment"; text: string };

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
  | { task: "segment"; items: string[] };

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
  const prompt = [
    "You are a content classifier for a university campus app. Score the",
    "following user-submitted text on each dimension from 0 to 1. The text",
    "may be in English, Hindi, or Hinglish/transliterated Hindi — score it",
    "regardless of language or script.",
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
    "",
    `Text: ${JSON.stringify(text)}`,
  ].join("\n");

  const res = await fetch(`${requireEnv("LLM_API_URL")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: requireEnv("LLM_MODEL_NAME"),
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Moderation call failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { response: string };
  const parsed = JSON.parse(body.response) as ModerationScores;
  return parsed;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${requireEnv("LLM_API_URL")}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: requireEnv("LLM_EMBEDDING_MODEL_NAME"),
      prompt: text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding call failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { embedding: number[] };
  return body.embedding;
}

async function remix(text: string, intensity: 1 | 2 | 3): Promise<string[]> {
  const prompt = [
    `Rewrite the following bucket-list item as 3 short variants at`,
    `intensity level ${intensity} of 3 (1 = mild tweak, 3 = ambitious`,
    `escalation). Dry, second-person, no exclamation marks, no emoji.`,
    'Respond with ONLY a JSON array of 3 strings.',
    "",
    `Text: ${JSON.stringify(text)}`,
  ].join("\n");

  const res = await fetch(`${requireEnv("LLM_API_URL")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: requireEnv("LLM_MODEL_NAME"),
      prompt,
      format: "json",
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Remix call failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { response: string };
  return JSON.parse(body.response) as string[];
}

// §13.2: bulk "smart paste" — splits free-form pasted text (a Notes app
// list, a WhatsApp message) into candidate item titles. Same minimal
// payload as every other task: the pasted text and nothing else. The
// result is a proposal, never committed directly — the caller
// (lib/import/actions.ts) always shows a preview before anything is saved.
async function segment(text: string): Promise<string[]> {
  const prompt = [
    "Split the following free-form text into a list of separate,",
    "individual to-do/bucket-list items. The text may be a Notes app list,",
    "a chat message, or just prose — find the discrete items in it. Each",
    "item should be a short, standalone phrase. Do not invent items that",
    "aren't in the text. If the text is already a single item, return an",
    "array with just that one string.",
    'Respond with ONLY a JSON array of strings, e.g. ["item one", "item two"].',
    "",
    `Text: ${JSON.stringify(text)}`,
  ].join("\n");

  const res = await fetch(`${requireEnv("LLM_API_URL")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: requireEnv("LLM_MODEL_NAME"),
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Segment call failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { response: string };
  const parsed = JSON.parse(body.response) as string[];
  return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
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
  }
}

export { AiDisabledError };
