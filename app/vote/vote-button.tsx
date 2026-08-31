"use client";

import { useOptimistic, useTransition } from "react";
import { toggleQuestVote } from "@/lib/quest-votes/actions";

// Optimistic like /explore's AddButton and /list's stamp — the count moves
// the instant you tap, and only reverts if the server actually refuses.
export function VoteButton({
  questId,
  voteCount,
  hasVoted,
}: {
  questId: string;
  voteCount: number;
  hasVoted: boolean;
}) {
  const [state, setState] = useOptimistic(
    { voteCount, hasVoted },
    (_current, next: { voteCount: number; hasVoted: boolean }) => next
  );
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={state.hasVoted}
      aria-label={state.hasVoted ? "Remove your vote" : "Vote for this"}
      onClick={() =>
        startTransition(async () => {
          const optimistic = {
            hasVoted: !state.hasVoted,
            voteCount: state.voteCount + (state.hasVoted ? -1 : 1),
          };
          setState(optimistic);
          const result = await toggleQuestVote(questId);
          if (result.error) setState({ voteCount, hasVoted });
        })
      }
      className={`flex-none flex flex-col items-center justify-center w-14 py-1.5 border transition-colors duration-150 ${
        state.hasVoted
          ? "border-ink bg-ink text-page"
          : "border-rule text-ink-mid hover:border-ink hover:text-ink"
      } disabled:opacity-50`}
    >
      <span aria-hidden="true" className="text-s-minus-2 leading-none">
        ▲
      </span>
      <span className="font-mono text-s-0 font-semibold leading-tight mt-0.5">{state.voteCount}</span>
    </button>
  );
}
