import "server-only";
import { runDeterministicFilter } from "./deterministic";
import { callModel, AiDisabledError, type ModerationScores } from "@/lib/ai/call-model";

/*
 * The three-layer pipeline from BUILD-PROMPT.md §7, minus layer 3
 * (community reports, which is event-driven from lib/reports/actions.ts,
 * not part of a single text-in-decision-out call).
 *
 *   1. deterministic filter -> reject outright, no model call
 *   2. LLM classifier (Haiku-equivalent open-source model), text ONLY sent
 *      to callModel per the §14.1 data boundary — no user_id, item_id,
 *      handle, or email ever reaches the model
 *   3. (not here) community reports -> lib/reports/actions.ts
 *
 * REJECT_THRESHOLD / HOLD_THRESHOLD match §7 exactly: >=0.7 any dimension
 * rejects, 0.4-0.7 holds, else approves — except anonymous items, which
 * never get a direct "approved" from this pipeline alone (§6/#11: mandatory
 * human review). This function returns 'pending_human' for anonymous items
 * that would otherwise have been 'approved' or 'held', collapsing what the
 * original spec calls two cases into one queue, exactly as §7's table
 * intends ("0.4-0.7 -> held (named: admin queue; anonymous: human review)").
 */

const REJECT_THRESHOLD = 0.7;
const HOLD_THRESHOLD = 0.4;

export type ModerationDecision =
  | { outcome: "rejected"; reason: string; scores?: ModerationScores }
  // scores is null when 'held' was reached because the classifier
  // couldn't run at all (AI disabled or the call failed), not because of
  // an actual 0.4-0.7 score — the admin UI must show these differently,
  // never as if they were a real "borderline" classifier result.
  | { outcome: "held"; scores: ModerationScores | null }
  | { outcome: "pending_human"; scores: ModerationScores | null } // anonymous item, always lands here unless rejected
  | { outcome: "approved"; scores: ModerationScores }; // named item only, all dimensions < 0.4

export async function runModerationPipeline(
  text: string,
  isAnonymous: boolean
): Promise<ModerationDecision> {
  const deterministic = runDeterministicFilter(text);
  if (deterministic.blocked) {
    return { outcome: "rejected", reason: deterministic.reason };
  }

  let scores: ModerationScores;
  try {
    const result = await callModel({ task: "moderate", text });
    if (result.task !== "moderate") throw new Error("Unexpected callModel result shape.");
    scores = result.scores;
  } catch (err) {
    if (err instanceof AiDisabledError) {
      // AI_ENABLED=false: fail closed, never open. A named item sits
      // 'held' for manual admin review instead of silently skipping the
      // classifier layer; an anonymous item goes straight to human review,
      // which it needed anyway.
      return isAnonymous ? { outcome: "pending_human", scores: null } : { outcome: "held", scores: null };
    }
    // The classifier call itself failed (network, malformed response,
    // whatever) — same fail-closed posture, not an approval.
    console.error("Moderation classifier call failed, failing closed:", err);
    return isAnonymous ? { outcome: "pending_human", scores: null } : { outcome: "held", scores: null };
  }

  const maxScore = Math.max(...Object.values(scores));
  const worstDimension = (Object.entries(scores) as [string, number][]).find(([, v]) => v === maxScore)?.[0];

  if (maxScore >= REJECT_THRESHOLD) {
    return {
      outcome: "rejected",
      reason: `Flagged for ${worstDimension?.replace(/_/g, " ")}.`,
      scores,
    };
  }

  if (isAnonymous) {
    // Mandatory human review regardless of how clean the scores are —
    // this is what #11 in the non-negotiables actually requires.
    return { outcome: "pending_human", scores };
  }

  if (maxScore >= HOLD_THRESHOLD) {
    return { outcome: "held", scores };
  }

  return { outcome: "approved", scores };
}
