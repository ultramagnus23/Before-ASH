"use client";

import { useState, useTransition } from "react";
import { recordSettlement, confirmSettlement } from "@/lib/money/actions";
import { parseRupees } from "@/lib/money/split";

type Member = { userId: string; handle: string };

/*
 * The two halves of settle-up.
 *
 * "record" says I paid you. "confirm" says I received it. They are separate
 * on purpose and by different people: until the recipient confirms, the
 * settlement is a claim and does not move either balance. A single-sided
 * "mark as settled" would let one person clear a debt by asserting it, which
 * is precisely the argument this feature exists to avoid.
 */
export function SettleUp(
  props:
    | { mode: "record"; groupId: string; members: Member[] }
    | { mode: "confirm"; groupId: string; settlementId: string }
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (props.mode === "confirm") {
    return (
      <span className="flex-none">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmSettlement(props.settlementId, props.groupId);
              if (result.error) setError(result.error);
            })
          }
          className="font-mono text-s-minus-1 border border-ink px-3 py-1 hover:bg-ink hover:text-page disabled:opacity-40"
        >
          {pending ? "…" : "Yes, got it"}
        </button>
        {error && (
          <span role="alert" className="font-mono text-s-minus-2 text-stamp-red ml-2">
            {error}
          </span>
        )}
      </span>
    );
  }

  return <RecordPayment groupId={props.groupId} members={props.members} />;
}

function RecordPayment({ groupId, members }: { groupId: string; members: Member[] }) {
  const [toId, setToId] = useState(members[0]?.userId ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const amountPaise = parseRupees(amount);
  const canSubmit = toId.length > 0 && amountPaise !== null && amountPaise > 0;

  return (
    <div className="border border-rule px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-2 mb-3">
        <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint">you paid</span>
        {members.map((member) => (
          <button
            key={member.userId}
            type="button"
            onClick={() => setToId(member.userId)}
            className={`font-mono text-s-minus-1 px-2 py-0.5 border ${
              toId === member.userId
                ? "bg-ink text-page border-ink"
                : "border-rule text-ink-mid hover:border-ink"
            }`}
          >
            {member.handle}
          </button>
        ))}
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setSent(false);
          }}
          inputMode="decimal"
          placeholder="₹0.00"
          aria-label="Amount you paid"
          className="w-[10ch] bg-transparent border-b border-rule focus:border-ink outline-none py-1 font-mono"
        />
      </div>

      {error && (
        <p role="alert" className="font-mono text-s-minus-2 text-stamp-red mb-3">
          {error}
        </p>
      )}
      {sent && (
        <p className="font-mono text-s-minus-2 text-ink-faint mb-3" aria-live="polite">
          Recorded. It counts once they confirm it.
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await recordSettlement({ groupId, toId, amount });
            if (result.error) {
              setError(result.error);
              return;
            }
            setAmount("");
            setSent(true);
          });
        }}
        className="border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        {pending ? "Saving…" : "Record it"}
      </button>
    </div>
  );
}
