"use client";

import { useTransition } from "react";
import type { BoardJoinRequestRow } from "@/lib/queries/boards";
import { respondToJoinRequest } from "@/lib/boards/actions";

export function JoinRequestList({ requests }: { requests: BoardJoinRequestRow[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 pt-4 border-t border-rule-fine">
      <h3 className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide mb-2">
        Join requests ({requests.length})
      </h3>
      <ul className="list-none">
        {requests.map((req) => (
          <li key={req.id} className="py-1.5 border-b border-rule-fine">
            <p className="text-s-minus-1">
              @{req.handle}
              {req.message && <span className="text-ink-mid italic"> — &quot;{req.message}&quot;</span>}
            </p>
            <div className="flex gap-4 mt-1 font-mono text-s-minus-2">
              <button
                disabled={pending}
                onClick={() => startTransition(() => { respondToJoinRequest(req.id, true); })}
                className="text-ink font-semibold disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={pending}
                onClick={() => startTransition(() => { respondToJoinRequest(req.id, false); })}
                className="text-ink-faint disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
