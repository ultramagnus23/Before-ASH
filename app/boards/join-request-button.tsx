"use client";

import { useState, useTransition } from "react";
import { requestToJoinBoard } from "@/lib/boards/actions";

export function JoinRequestButton({ boardId, alreadyRequested }: { boardId: string; alreadyRequested: boolean }) {
  const [requested, setRequested] = useState(alreadyRequested);
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (requested) {
    return <p className="font-mono text-s-minus-2 text-ink-faint mt-1.5">Request sent.</p>;
  }

  if (!showMessage) {
    return (
      <button onClick={() => setShowMessage(true)} className="font-mono text-s-minus-1 text-ink-mid underline mt-1.5">
        Ask to join
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={280}
        placeholder="Why you want in (optional)"
        className="w-full border-b border-rule bg-transparent text-s-minus-1 py-1 mb-1.5"
      />
      {error && <p className="font-mono text-s-minus-2 text-error mb-1">{error}</p>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await requestToJoinBoard(boardId, message);
            if (result.error) {
              setError(result.error);
              return;
            }
            setRequested(true);
          })
        }
        className="font-mono text-s-minus-2 text-ink-mid underline disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </div>
  );
}
