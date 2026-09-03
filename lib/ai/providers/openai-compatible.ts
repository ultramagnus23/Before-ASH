import "server-only";
import type { InferenceProvider, ProviderHealth } from "./types";

/*
 * The one provider implemented today. It speaks the OpenAI-compatible wire
 * format (`/chat/completions`, `/embeddings`, optional Bearer key), which is
 * deliberate rather than incidental: it is the format Groq, Together,
 * DeepInfra, OpenRouter, HuggingFace TGI and vLLM all serve, AND the one
 * Ollama serves on its own `/v1` path. One implementation therefore covers
 * both "a reachable hosted open-weights endpoint" (what production needs)
 * and "the laptop I develop on".
 *
 * This replaces a hardcoded Ollama-native integration (`/api/generate`,
 * `/api/embeddings`, no auth header at all). That shape could not be pointed
 * at any hosted provider without a rewrite, which is the actual reason
 * production had no working moderation: LLM_API_URL was still
 * http://localhost:11434, unreachable from Vercel, and every call failed.
 *
 * Still no closed-model vendor: this is a wire format, not a vendor. Nothing
 * here permits Anthropic or OpenAI as the endpoint, and §14.1's rule that
 * the model must be open-weights is a deployment choice enforced by which
 * LLM_API_URL/LLM_MODEL_NAME you configure.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

/** Trailing slashes make `${base}/embeddings` become `//embeddings` on some hosts. */
function baseUrl(): string {
  return requireEnv("LLM_API_URL").replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  // Optional on purpose: a local Ollama has no key, a hosted provider does.
  const key = env("LLM_API_KEY");
  if (key) h.authorization = `Bearer ${key}`;
  return h;
}

function timeoutMs(): number {
  const raw = env("LLM_TIMEOUT_MS");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Every network call goes through here so nothing can hang a serverless
 * invocation forever. An unbounded fetch is how a degraded provider turns
 * into a timed-out request instead of a clean fail-closed decision.
 */
async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });
}

/** Error text is truncated and never includes the request body. */
async function failure(label: string, res: Response): Promise<Error> {
  const detail = await res.text().catch(() => "");
  return new Error(`${label} failed: ${res.status} ${detail.slice(0, 300)}`);
}

export const openAiCompatibleProvider: InferenceProvider = {
  id: "openai-compatible",

  async json<T>({
    system,
    user,
    temperature = 0,
  }: {
    system: string;
    user: string;
    temperature?: number;
  }): Promise<T> {
    const res = await post("/chat/completions", {
      model: requireEnv("LLM_MODEL_NAME"),
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!res.ok) throw await failure("Chat", res);

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Chat returned no content.");

    try {
      return JSON.parse(content) as T;
    } catch {
      // A model that ignored response_format is a provider/model
      // misconfiguration, not a user problem — say which, without echoing
      // the content back into logs.
      throw new Error("Chat did not return parseable JSON. Check LLM_MODEL_NAME supports JSON output.");
    }
  },

  async embed(text: string): Promise<number[]> {
    const res = await post("/embeddings", {
      model: requireEnv("LLM_EMBEDDING_MODEL_NAME"),
      input: text,
    });

    if (!res.ok) throw await failure("Embedding", res);

    const body = (await res.json()) as { data?: { embedding?: number[] }[] };
    const embedding = body.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Embedding response contained no vector.");
    }
    return embedding;
  },

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    const done = (r: Omit<ProviderHealth, "latencyMs" | "provider">): ProviderHealth => ({
      ...r,
      provider: "openai-compatible",
      latencyMs: Date.now() - started,
    });

    // `/models` first: it costs no tokens. Not every OpenAI-compatible host
    // implements it, so a 404/405 is not a failure — fall through and prove
    // reachability with the cheapest real call instead.
    try {
      const res = await fetch(`${baseUrl()}/models`, {
        headers: headers(),
        signal: AbortSignal.timeout(timeoutMs()),
        cache: "no-store",
      });
      if (res.ok) return done({ ok: true, via: "models" });
      if (res.status !== 404 && res.status !== 405) {
        return done({ ok: false, via: "models", error: `models: ${res.status}` });
      }
    } catch (e) {
      return done({ ok: false, via: "models", error: (e as Error).message.slice(0, 200) });
    }

    try {
      await this.embed("ping");
      return done({ ok: true, via: "embeddings" });
    } catch (e) {
      return done({ ok: false, via: "embeddings", error: (e as Error).message.slice(0, 200) });
    }
  },
};
