// Layer 1 of the pipeline (BUILD-PROMPT.md §7): blocks outright, no model
// call. Deliberately conservative and fast — this exists to catch the
// unambiguous cases cheaply before spending an LLM call on layer 2, not to
// be a complete safety net on its own.

// A short, explicit list. Real deployments should grow this from actual
// moderation logs, not from guessing every slur that might exist — this is
// a starting point, not a claim of completeness.
const BLOCKED_TERMS = [
  "fuck you",
  "kill yourself",
  "kys",
  "chutiya",
  "randi",
  "bhenchod",
  "madarchod",
];

const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i;
const PHONE_PATTERN = /(\+?\d[\s-]?){9,}/; // 9+ digits, loosely — catches Indian mobile numbers with or without separators
const ROOM_NUMBER_PATTERN = /\b(room|rm)\s*#?\s*\d{2,4}\b/i;
const REPEATED_CHARS_PATTERN = /(.)\1{6,}/; // same character 7+ times in a row — spam/flood pattern, not a real word

export type DeterministicResult = { blocked: false } | { blocked: true; reason: string };

export function runDeterministicFilter(text: string): DeterministicResult {
  const normalized = text.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    if (normalized.includes(term)) {
      return { blocked: true, reason: "Contains language that's not allowed here." };
    }
  }

  if (URL_PATTERN.test(text)) {
    return { blocked: true, reason: "Links aren't allowed in this field." };
  }

  if (PHONE_PATTERN.test(text)) {
    return { blocked: true, reason: "Looks like it contains a phone number." };
  }

  if (ROOM_NUMBER_PATTERN.test(text)) {
    return { blocked: true, reason: "Looks like it contains a specific room number." };
  }

  if (REPEATED_CHARS_PATTERN.test(text)) {
    return { blocked: true, reason: "That doesn't look like real text." };
  }

  return { blocked: false };
}
