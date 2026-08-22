"use client";

import { useTransition } from "react";
import { acceptConnection, declineConnection, revokeConnection } from "@/lib/connections/actions";

export function ConnectionActions({
  connectionId,
  kind,
}: {
  connectionId: string;
  kind: "incoming" | "active";
}) {
  const [pending, startTransition] = useTransition();

  if (kind === "incoming") {
    return (
      <div className="flex gap-4 mt-1.5">
        <button
          disabled={pending}
          onClick={() => startTransition(() => { acceptConnection(connectionId); })}
          className="font-mono text-s-minus-1 text-ink font-semibold disabled:opacity-50"
        >
          Accept
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => { declineConnection(connectionId); })}
          className="font-mono text-s-minus-1 text-ink-faint disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => { revokeConnection(connectionId); })}
      className="font-mono text-s-minus-1 text-error mt-1.5 disabled:opacity-50"
    >
      Revoke
    </button>
  );
}
