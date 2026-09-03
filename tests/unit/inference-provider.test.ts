import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * Task 0's fourth requirement: prove moderation genuinely runs in a
 * production-like config, rather than assuming it because the code compiles.
 *
 * "Production-like" here means: env configured the way Vercel is configured,
 * a real fetch round trip through the provider (stubbed at the network
 * boundary, not at the provider boundary — stubbing getProvider would test
 * nothing), and the OpenAI-compatible wire shape actually asserted.
 *
 * The specific regression these guard: production had LLM_API_URL pointing
 * at localhost and an Ollama-native integration, so every call failed, and
 * nothing in the test suite noticed because nothing exercised the wire.
 */

const ENV = {
  AI_ENABLED: "true",
  LLM_API_URL: "https://inference.example/openai/v1",
  LLM_MODEL_NAME: "test-open-model",
  LLM_EMBEDDING_MODEL_NAME: "test-embed-model",
  LLM_API_KEY: "test-key",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const chatResponse = (payload: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("moderation in a production-like config", () => {
  it("calls the OpenAI-compatible chat endpoint with auth and JSON mode", async () => {
    const scores = {
      names_person: 0.1, sexual: 0, harassment: 0,
      dangerous: 0, illegal: 0, discriminatory: 0,
    };
    fetchMock.mockResolvedValue(chatResponse(scores));

    const { callModel } = await import("@/lib/ai/call-model");
    const result = await callModel({ task: "moderate", text: "climb the water tower" });

    expect(result).toEqual({ task: "moderate", scores });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://inference.example/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-open-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    // The §14.1 data boundary, asserted rather than trusted: the only user
    // content on the wire is the text itself.
    expect(JSON.stringify(body)).toContain("climb the water tower");
    expect(JSON.stringify(body)).not.toMatch(/user_id|owner_id|handle|@ashoka/i);
  });

  it("propagates a provider failure so the pipeline can fail closed", async () => {
    fetchMock.mockResolvedValue(new Response("upstream exploded", { status: 502 }));
    const { callModel } = await import("@/lib/ai/call-model");
    await expect(callModel({ task: "moderate", text: "anything" })).rejects.toThrow(/502/);
  });

  it("fails closed rather than approving when the endpoint is unreachable", async () => {
    // The exact production shape: the host does not resolve.
    fetchMock.mockRejectedValue(new Error("fetch failed: ENOTFOUND"));
    const { runModerationPipeline } = await import("@/lib/moderation/pipeline");

    const named = await runModerationPipeline("a perfectly ordinary item", false);
    expect(named.outcome).toBe("held");

    const anon = await runModerationPipeline("a perfectly ordinary item", true);
    expect(anon.outcome).toBe("pending_human");
  });

  it("never publishes when AI is switched off", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    const { runModerationPipeline } = await import("@/lib/moderation/pipeline");
    const decision = await runModerationPipeline("harmless", false);
    expect(decision.outcome).toBe("held");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("embeddings", () => {
  it("reads the OpenAI-compatible data[0].embedding shape", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 })
    );
    const { callModel } = await import("@/lib/ai/call-model");
    const result = await callModel({ task: "embed", text: "quiet places" });
    expect(result).toEqual({ task: "embed", embedding: [0.1, 0.2, 0.3] });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://inference.example/openai/v1/embeddings");
  });
});

describe("json_object object-wrapper contract", () => {
  // response_format json_object cannot return a top-level array, so remix
  // and segment must ask for an object. A model returning a bare array here
  // would previously have parsed fine under Ollama's format:"json" and now
  // would not — hence an explicit test.
  it("unwraps remix variants", async () => {
    fetchMock.mockResolvedValue(chatResponse({ variants: ["a", "b", "c"] }));
    const { callModel } = await import("@/lib/ai/call-model");
    const result = await callModel({ task: "remix", text: "go outside", intensity: 2 });
    expect(result).toEqual({ task: "remix", variants: ["a", "b", "c"] });
  });

  it("unwraps segment items and drops blanks", async () => {
    fetchMock.mockResolvedValue(chatResponse({ items: ["one", "  ", "two"] }));
    const { callModel } = await import("@/lib/ai/call-model");
    const result = await callModel({ task: "segment", text: "one\ntwo" });
    expect(result).toEqual({ task: "segment", items: ["one", "two"] });
  });
});

describe("health check", () => {
  it("reports unhealthy, not healthy, when the endpoint is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND inference.example"));
    const { checkInferenceHealth } = await import("@/lib/ai/health");
    const health = await checkInferenceHealth();
    expect(health.ok).toBe(false);
    expect(health.aiEnabled).toBe(true);
    expect(health.configured).toBe(true);
  });

  it("distinguishes 'not configured' from 'unreachable'", async () => {
    vi.stubEnv("LLM_API_URL", "");
    const { checkInferenceHealth } = await import("@/lib/ai/health");
    const health = await checkInferenceHealth();
    expect(health.ok).toBe(false);
    expect(health.configured).toBe(false);
    expect(health.error).toMatch(/unset/i);
  });

  it("is healthy when /models responds", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const { checkInferenceHealth } = await import("@/lib/ai/health");
    const health = await checkInferenceHealth();
    expect(health.ok).toBe(true);
    expect(health.via).toBe("models");
  });
});
