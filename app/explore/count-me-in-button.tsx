"use client";

import { useState, useTransition } from "react";
import { countMeIn } from "@/lib/interests/actions";

/*
 * The affordance the whole match mechanic hangs off. Three states, and the
 * distinction between them is the product:
 *
 *   idle    — "Count me in"
 *   in      — you hold live interest, nobody else does yet
 *   matched — someone else wants this too
 *
 * "in" deliberately does NOT say how many other people are interested, or
 * that nobody is. Interest is private (RLS enforces it), and a count would
 * both leak it and read as a denominator, which §1 rules out everywhere.
 * "Waiting for someone else" is true without being a number.
 */
export function CountMeInButton({ questId, initiallyIn = false }: { questId: string; initiallyIn?: boolean }) {
  const [state, setState] = useState<"idle" | "in" | "matched">(initiallyIn ? "in" : "idle");
  const [pending, startTransition] = useTransition();

  if (state === "matched") {
    return (
      <span className="font-mono text-s-minus-1 text-stamp-teal whitespace-nowrap" aria-live="polite">
        Matched — check your notifications
      </span>
    );
  }

  if (state === "in") {
    return (
      <span className="font-mono text-s-minus-1 text-ink-faint whitespace-nowrap" aria-live="polite">
        You&rsquo;re in. Waiting for someone else
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Optimistic to "in": the common outcome by far, and the one the
          // user is entitled to see instantly. A match upgrades it a beat
          // later; a failure drops it back with the reason.
          setState("in");
          const result = await countMeIn(questId);
          if (result.error) {
            setState("idle");
            return;
          }
          if (result.matched) setState("matched");
        })
      }
      className="font-mono text-s-minus-1 text-ink-mid border-b border-rule pb-px flex-none hover:text-ink hover:border-ink disabled:opacity-50 whitespace-nowrap"
    >
      {pending ? "…" : "Count me in"}
    </button>
  );
}
