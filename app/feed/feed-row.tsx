"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import type { PublicListItem } from "@/lib/queries/list-items";
import { addFromCatalog, addCustomCopy } from "@/lib/list-items/actions";
import { expressInterest } from "@/lib/connections/actions";
import { toggleReaction } from "@/lib/reactions/actions";
import { fileReport } from "@/lib/reports/actions";
import { blockUserByHandle } from "@/lib/blocks/actions";

export function FeedRow({ item }: { item: PublicListItem }) {
  const passthrough = (_current: boolean, next: boolean) => next;
  const [added, setAdded] = useOptimistic(false, passthrough);
  const [interested, setInterested] = useOptimistic(false, passthrough);
  const [respected, setRespected] = useOptimistic(false, passthrough);
  const [blocked, setBlocked] = useOptimistic(false, passthrough);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  const who = item.visibility === "anonymous" ? "Anonymous" : item.ownerHandle ? `@${item.ownerHandle}` : "Someone";

  if (blocked) return null;

  return (
    <li className="wire-row py-[1.15rem]">
      <div className="font-mono text-s-minus-1 text-ink-faint tracking-wide mb-1.5">
        <span className="text-ink-mid">{who}</span> stamped
      </div>

      {item.questSlug ? (
        <Link href={`/q/${item.questSlug}`} className="font-display font-medium text-s-1 leading-[1.24] text-ink hover:underline">
          {item.title}
        </Link>
      ) : (
        <h2 className="font-display font-medium text-s-1 leading-[1.24] text-ink">{item.title}</h2>
      )}

      {item.proof && <p className="mt-1.5 text-ink-mid italic">&quot;{item.proof}&quot;</p>}

      {!item.isOwnItem && (
        <div className="flex flex-wrap gap-4 mt-2.5">
          <button
            disabled={pending || added}
            onClick={() =>
              startTransition(async () => {
                setAdded(true);
                const result = item.questId ? await addFromCatalog(item.questId) : await addCustomCopy(item.title, item.category);
                if (result.error) setMessage(result.error);
              })
            }
            className="font-mono text-s-minus-1 text-ink-faint border-b border-transparent hover:text-ink hover:border-rule disabled:opacity-60"
          >
            {added ? "Added." : "Add it"}
          </button>

          <button
            disabled={pending || interested}
            onClick={() =>
              startTransition(async () => {
                setInterested(true);
                const result = await expressInterest(item.id);
                if (result.error) setMessage(result.error);
              })
            }
            className="font-mono text-s-minus-1 text-ink-faint border-b border-transparent hover:text-ink hover:border-rule disabled:opacity-60"
          >
            {interested ? "You're in." : "I'm in"}
          </button>

          <button
            disabled={pending}
            onClick={() => {
              // useOptimistic's setter dispatches an action into the reducer
              // directly — it isn't useState's functional-updater form, so
              // the next value has to be computed here, closing over the
              // current `respected` from this render, not inside the setter call.
              const next = !respected;
              startTransition(async () => {
                setRespected(next);
                await toggleReaction(item.id);
              });
            }}
            className={`font-mono text-s-minus-1 border-b border-transparent hover:border-rule ${
              respected ? "text-ink" : "text-ink-faint hover:text-ink"
            }`}
          >
            Respect
          </button>

          {!reported && (
            <button
              disabled={pending}
              onClick={() => setReporting((r) => !r)}
              className="font-mono text-s-minus-1 text-ink-faint border-b border-transparent hover:text-ink hover:border-rule disabled:opacity-60"
            >
              Report
            </button>
          )}

          {/* Blocking requires a handle — never available on an anonymous
              item, since that would mean exposing an identity the product
              otherwise guarantees stays hidden. See lib/blocks/actions.ts. */}
          {item.visibility !== "anonymous" && item.ownerHandle && (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setBlocked(true);
                  await blockUserByHandle(item.ownerHandle!);
                })
              }
              className="font-mono text-s-minus-1 text-ink-faint border-b border-transparent hover:text-ink hover:border-rule disabled:opacity-60"
            >
              Block
            </button>
          )}
        </div>
      )}

      {reporting && !reported && (
        <form
          className="mt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason") as string;
            startTransition(async () => {
              const result = await fileReport(item.id, reason);
              if (result.error) {
                setMessage(result.error);
                return;
              }
              setReported(true);
              setReporting(false);
            });
          }}
        >
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder="What's wrong with this one"
            className="w-full border border-rule p-2 text-s-minus-1"
          />
          <button
            type="submit"
            disabled={pending}
            className="font-mono text-s-minus-2 text-ink-mid underline mt-1 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send report"}
          </button>
        </form>
      )}
      {reported && <p className="mt-1.5 font-mono text-s-minus-2 text-ink-faint">Reported. Thanks.</p>}

      {message && <p className="mt-1.5 text-error font-mono text-s-minus-1">{message}</p>}
    </li>
  );
}
