"use client";

import { useOptimistic, useTransition } from "react";
import { addFromCatalog } from "@/lib/list-items/actions";

// Optimistic per BUILD-PROMPT.md P3: the button flips to "Added." the
// instant it's clicked, before the server confirms — this is the one path
// that may never break (add-to-list), so it also gets the e2e test in
// tests/e2e/add-to-list.spec.ts.
export function AddButton({ questId, alreadyAdded }: { questId: string; alreadyAdded: boolean }) {
  const [optimisticAdded, setOptimisticAdded] = useOptimistic(alreadyAdded);
  const [pending, startTransition] = useTransition();

  if (optimisticAdded) {
    return (
      <span className="font-mono text-s-minus-1 text-ink-faint flex-none" aria-live="polite">
        Added.
      </span>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          setOptimisticAdded(true);
          await addFromCatalog(questId);
        });
      }}
      className="font-mono text-s-minus-1 text-ink-mid border-b border-rule pb-px flex-none hover:text-ink hover:border-ink"
    >
      Add it
    </button>
  );
}
