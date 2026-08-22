"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReviewQueueItem } from "@/lib/queries/admin";
import { approveItem, rejectItem, restoreItem, revealIdentity } from "@/lib/admin/actions";

// Keyboard-driven, one item at a time, per BUILD-PROMPT.md P6: A = approve,
// R = reject (opens a reason prompt), H = restore (only shown for
// held/flagged — an auto-hide reversal, not a fresh decision), I = reveal
// identity (opens the reason prompt, requires >=20 chars).
export function ReviewQueue({ items: initialItems }: { items: ReviewQueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealedHandle, setRevealedHandle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const current = items[index];

  function advance() {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.min(i, items.length - 2));
    setRejecting(false);
    setRevealing(false);
    setRevealedHandle(null);
    setMessage(null);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!current || pending || rejecting || revealing) return;
      if (e.key.toLowerCase() === "a") {
        startTransition(async () => {
          await approveItem(current.listItemId);
          advance();
        });
      } else if (e.key.toLowerCase() === "r") {
        setRejecting(true);
      } else if (e.key.toLowerCase() === "h" && (current.reviewState === "held" || current.reviewState === "flagged")) {
        startTransition(async () => {
          await restoreItem(current.listItemId);
          advance();
        });
      } else if (e.key.toLowerCase() === "i") {
        setRevealing(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, pending, rejecting, revealing]);

  if (!current) {
    return <p className="text-ink-faint font-mono text-s-minus-1">Queue's empty.</p>;
  }

  return (
    <div className="border border-rule p-6">
      <div className="flex justify-between font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint mb-4">
        <span>{current.category.replace(/_/g, " ")}</span>
        <span>
          {current.visibility} · {current.reviewState} · {current.accountAgeBucket} account · {current.priorRejectionCount} prior rejections
        </span>
      </div>

      <p className="font-display text-s-1 leading-[1.3] mb-6">{current.text}</p>

      {current.appealedAt && (
        <p className="font-mono text-s-minus-2 text-error mb-4">Appealed — floated to the top.</p>
      )}

      {!rejecting && !revealing && (
        <div className="flex gap-5 font-mono text-s-minus-1">
          <button onClick={() => startTransition(async () => { await approveItem(current.listItemId); advance(); })} disabled={pending} className="text-ink font-semibold">
            (A)pprove
          </button>
          <button onClick={() => setRejecting(true)} disabled={pending} className="text-error">
            (R)eject
          </button>
          {(current.reviewState === "held" || current.reviewState === "flagged") && (
            <button onClick={() => startTransition(async () => { await restoreItem(current.listItemId); advance(); })} disabled={pending} className="text-ink-mid">
              (H) Restore
            </button>
          )}
          <button onClick={() => setRevealing(true)} disabled={pending} className="text-ink-faint">
            (I) Reveal identity
          </button>
        </div>
      )}

      {rejecting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason") as string;
            startTransition(async () => {
              const result = await rejectItem(current.listItemId, reason);
              if (result.error) {
                setMessage(result.error);
                return;
              }
              advance();
            });
          }}
        >
          <textarea name="reason" required minLength={3} rows={2} autoFocus placeholder="Why rejected — shown to the author" className="w-full border border-rule p-2 text-s-minus-1 mb-2" />
          <div className="flex gap-3 font-mono text-s-minus-1">
            <button type="submit" disabled={pending} className="text-error font-semibold">Confirm reject</button>
            <button type="button" onClick={() => setRejecting(false)} className="text-ink-faint">Cancel (Esc)</button>
          </div>
        </form>
      )}

      {revealing && !revealedHandle && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason") as string;
            startTransition(async () => {
              const result = await revealIdentity(current.listItemId, reason);
              if (result.error) {
                setMessage(result.error);
                return;
              }
              setRevealedHandle(result.ownerHandle ?? "(no handle found)");
            });
          }}
        >
          <p className="font-mono text-s-minus-2 text-ink-faint mb-2">
            Written reason required, at least 20 characters. This writes an append-only, permanent record.
          </p>
          <textarea name="reason" required minLength={20} rows={2} autoFocus placeholder="Why this reveal is necessary" className="w-full border border-rule p-2 text-s-minus-1 mb-2" />
          <div className="flex gap-3 font-mono text-s-minus-1">
            <button type="submit" disabled={pending} className="text-ink font-semibold">Confirm reveal</button>
            <button type="button" onClick={() => setRevealing(false)} className="text-ink-faint">Cancel (Esc)</button>
          </div>
        </form>
      )}

      {revealedHandle && (
        <div>
          <p className="font-mono text-s-0 mb-3">Owner: @{revealedHandle}</p>
          <button onClick={advance} className="font-mono text-s-minus-1 text-ink underline">Continue</button>
        </div>
      )}

      {message && <p className="font-mono text-s-minus-1 text-error mt-3">{message}</p>}

      <p className="font-mono text-s-minus-2 text-ink-faint mt-6">
        {items.length} left in queue. Keyboard: A approve, R reject, H restore (auto-hide/flag only), I reveal identity.
      </p>
    </div>
  );
}
