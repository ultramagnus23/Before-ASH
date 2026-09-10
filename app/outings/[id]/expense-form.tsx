"use client";

import { useState, useTransition } from "react";
import { recordExpense } from "@/lib/money/actions";
import { splitEvenly, parseRupees, formatPaise } from "@/lib/money/split";

type Member = { userId: string; handle: string };

/*
 * Entering an expense.
 *
 * The amount stays a STRING the whole way through — typed here, validated
 * here, parsed to integer paise on the server. Binding it to a number input's
 * valueAsNumber would put a float in the middle of the money path, which is
 * the one thing this feature must never do.
 *
 * The preview below the form is computed with the same splitEvenly() the
 * server uses, so what you see before saving is what gets written.
 */
export function ExpenseForm({
  groupId,
  members,
  viewerId,
}: {
  groupId: string;
  members: Member[];
  viewerId: string;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState(viewerId);
  const [sharedWith, setSharedWith] = useState<string[]>(members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountPaise = parseRupees(amount);
  const preview =
    amountPaise !== null && amountPaise !== 0 && sharedWith.length > 0
      ? splitEvenly(amountPaise, sharedWith, 0)
      : null;

  function toggle(userId: string) {
    setSharedWith((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordExpense({ groupId, description, amount, payerId, sharedWith });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDescription("");
      setAmount("");
    });
  }

  const canSubmit =
    description.trim().length > 0 && amountPaise !== null && amountPaise !== 0 && sharedWith.length > 0;

  return (
    <div className="border border-rule px-4 py-4">
      <div className="flex flex-wrap gap-3 mb-3">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it"
          maxLength={120}
          className="flex-1 min-w-[16ch] bg-transparent border-b border-rule focus:border-ink outline-none py-1"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="₹0.00"
          aria-label="Amount in rupees"
          className="w-[10ch] bg-transparent border-b border-rule focus:border-ink outline-none py-1 font-mono"
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-2 mb-3">
        <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint">paid by</span>
        {members.map((member) => (
          <button
            key={member.userId}
            type="button"
            onClick={() => setPayerId(member.userId)}
            className={`font-mono text-s-minus-1 px-2 py-0.5 border ${
              payerId === member.userId
                ? "bg-ink text-page border-ink"
                : "border-rule text-ink-mid hover:border-ink"
            }`}
          >
            {member.userId === viewerId ? "you" : member.handle}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-2 mb-3">
        <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint">split between</span>
        {members.map((member) => (
          <button
            key={member.userId}
            type="button"
            onClick={() => toggle(member.userId)}
            className={`font-mono text-s-minus-1 px-2 py-0.5 border ${
              sharedWith.includes(member.userId)
                ? "bg-ink text-page border-ink"
                : "border-rule text-ink-mid hover:border-ink"
            }`}
          >
            {member.userId === viewerId ? "you" : member.handle}
          </button>
        ))}
      </div>

      {preview && (
        <p className="font-mono text-s-minus-2 text-ink-faint mb-3">
          {preview
            .map((share) => {
              const member = members.find((m) => m.userId === share.userId);
              const name = share.userId === viewerId ? "you" : member?.handle ?? "?";
              return `${name} ${formatPaise(share.sharePaise)}`;
            })
            .join(" · ")}
        </p>
      )}

      {amount.length > 0 && amountPaise === null && (
        <p className="font-mono text-s-minus-2 text-stamp-red mb-3">
          Rupees and paise only — nothing smaller.
        </p>
      )}

      {error && (
        <p role="alert" className="font-mono text-s-minus-2 text-stamp-red mb-3">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit || pending}
        onClick={submit}
        className="border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        {pending ? "Saving…" : "Add it"}
      </button>
    </div>
  );
}
