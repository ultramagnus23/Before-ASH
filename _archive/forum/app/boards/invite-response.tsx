"use client";

import { useTransition } from "react";
import { respondToInvite } from "@/lib/boards/actions";

export function InviteResponse({ boardMemberId }: { boardMemberId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-4 mt-1.5 font-mono text-s-minus-1">
      <button
        disabled={pending}
        onClick={() => startTransition(() => { respondToInvite(boardMemberId, true); })}
        className="text-ink font-semibold disabled:opacity-50"
      >
        Accept
      </button>
      <button
        disabled={pending}
        onClick={() => startTransition(() => { respondToInvite(boardMemberId, false); })}
        className="text-ink-faint disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}
