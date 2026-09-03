import "server-only";
import type { InferenceProvider } from "./providers/types";
import { openAiCompatibleProvider } from "./providers/openai-compatible";

/*
 * Provider selection, in one place, so call sites never name a provider.
 *
 * Exactly one implementation exists today, by instruction — Task 0 says
 * introduce the seam, do not build the second provider yet. Adding one later
 * means writing the file and adding a line to the record below; no call site
 * changes, which is the whole point of the seam.
 */

const PROVIDERS: Record<string, InferenceProvider> = {
  [openAiCompatibleProvider.id]: openAiCompatibleProvider,
};

const DEFAULT_PROVIDER = openAiCompatibleProvider.id;

export function providerId(): string {
  return process.env.LLM_PROVIDER?.trim() || DEFAULT_PROVIDER;
}

export function getProvider(): InferenceProvider {
  const id = providerId();
  const provider = PROVIDERS[id];
  if (!provider) {
    // Naming the valid options matters here: a typo'd LLM_PROVIDER would
    // otherwise fail closed with no hint about what to set it to.
    throw new Error(
      `Unknown LLM_PROVIDER "${id}". Available: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  return provider;
}
