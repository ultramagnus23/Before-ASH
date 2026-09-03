import "server-only";

/*
 * The seam a second inference provider slots into later.
 *
 * Task 0 of the build prompt says: introduce the interface now so a second
 * provider can be added without touching call sites, but do NOT implement a
 * second one yet. So there is exactly one implementation today
 * (openai-compatible.ts) and this file exists to keep that choice reversible.
 *
 * The privacy contract from BUILD-PROMPT.md §14.1 lives one level up, in
 * call-model.ts's input type: a provider only ever receives text that
 * callModel has already accepted, and has no parameter to carry a user id,
 * item id, handle, or timestamp. Keep it that way — adding an "options" bag
 * here would quietly reopen that hole.
 */

export type ProviderHealth = {
  ok: boolean;
  provider: string;
  /** How the check was satisfied, for the health endpoint to report. */
  via: "models" | "embeddings" | "none";
  latencyMs: number;
  /** Present only when ok === false. Never contains user content. */
  error?: string;
};

export interface InferenceProvider {
  readonly id: string;

  /**
   * Send a prompt and get parsed JSON back. The provider is responsible for
   * asking the model for JSON and for parsing it; callers get a value, not a
   * string to parse themselves.
   */
  json<T>(args: { system: string; user: string; temperature?: number }): Promise<T>;

  /** A single embedding vector for one piece of text. */
  embed(text: string): Promise<number[]>;

  /** Cheap reachability probe. Must not throw — returns ok:false instead. */
  health(): Promise<ProviderHealth>;
}
