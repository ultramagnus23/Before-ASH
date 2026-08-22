"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { OwnListItem } from "@/lib/queries/list-items";
import { markDone, removeListItem, setProof, setVisibility, convertToNamed } from "@/lib/list-items/actions";
import { STALE_PENDING_DAYS } from "@/lib/list-items/constants";
import { fileAppeal } from "@/lib/reports/actions";
import { inkForCategory, seedRotationDeg, stampCode, formatStampDate } from "@/lib/stamps";
import { useToast } from "./toast";
import { BlogEditor } from "./blog-editor";

const HOLD_DURATION_MS = 420;

const CATEGORY_LABEL: Record<string, string> = {
  campus_ritual: "Campus ritual",
  academic: "Academic",
  food: "Food",
  people: "People",
  creative: "Make",
  body_sport: "Body",
  delhi_ncr: "Off campus",
  career_money: "Career",
  service: "Give",
  solitude: "Alone",
  night: "After midnight",
  legacy: "Before you leave",
  chaos: "Chaotic good",
  skills: "Learn",
  admin_life: "Unglamorous",
};

export function ListRow({ item, anonEnabled }: { item: OwnListItem; anonEnabled: boolean }) {
  type RowState = {
    completedAt: string | null;
    proof: string | null;
    visibility: OwnListItem["visibility"];
    reviewState: string;
  };
  const [state, setState] = useOptimistic<RowState, Partial<RowState>>(
    { completedAt: item.completedAt, proof: item.proof, visibility: item.visibility, reviewState: item.reviewState },
    (current, patch) => ({ ...current, ...patch })
  );
  const [pending, startTransition] = useTransition();
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const isDone = Boolean(state.completedAt);
  const ink = inkForCategory(item.category);
  const rotation = seedRotationDeg(item.id);
  const code = stampCode({ questId: item.questId, listItemId: item.id });

  function doStamp() {
    startTransition(async () => {
      setState({ completedAt: new Date().toISOString(), proof: state.proof });
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
      toast("Stamped.");
      const result = await markDone(item.id);
      if (result.error) {
        toast(result.error);
        return;
      }
      setTimeout(() => proofInputRef.current?.focus(), 240);
    });
  }

  function startHold(e: React.PointerEvent) {
    if (isDone) return;
    e.preventDefault();
    setHolding(true);
    timerRef.current = setTimeout(() => {
      setHolding(false);
      doStamp();
    }, HOLD_DURATION_MS);
  }

  function cancelHold() {
    setHolding(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || isDone) return;
    e.preventDefault();
    // Holding a key down doesn't have well-defined semantics across
    // browsers and screen readers, so the keyboard equivalent substitutes
    // an explicit confirmation for the press-and-hold gesture instead of
    // trying to time a keypress duration.
    if (window.confirm("Stamp this one?")) {
      doStamp();
    }
  }

  return (
    <li
      data-testid="list-row"
      data-done={isDone}
      className={`stamp-row-done relative grid grid-cols-[24px_1fr_auto] gap-3.5 items-start border-b border-rule-fine transition-[padding] duration-200 ${
        isDone ? "py-7" : "py-[1.125rem]"
      }`}
      style={{ ["--stamp-rotate" as string]: `${rotation}deg` }}
    >
      <button
        type="button"
        data-testid="stamp-mark"
        aria-label={isDone ? `Stamped: ${item.title}` : `Hold to stamp: ${item.title}`}
        disabled={isDone || pending}
        className={`stamp-mark${holding ? " holding" : ""} mt-0.5`}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={handleKeyDown}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <circle className="ring" cx="12" cy="12" r="9.5" />
          <circle className="arc" cx="12" cy="12" r="9.5" />
          <circle className="dot" cx="12" cy="12" r="3" />
        </svg>
      </button>

      <div>
        <h3 className={`font-display font-medium text-s-1 leading-[1.24] transition-colors duration-200 ${isDone ? "text-ink" : "text-ink-mid"}`}>
          {item.title}
        </h3>
        <div className="font-mono text-s-minus-1 text-ink-faint tracking-wide mt-1">
          {CATEGORY_LABEL[item.category] ?? item.category}
        </div>

        <div
          className="grid transition-[grid-template-rows] duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)]"
          style={{ gridTemplateRows: isDone ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <input
              ref={proofInputRef}
              defaultValue={state.proof ?? ""}
              placeholder="how was it"
              aria-label="One line of proof"
              maxLength={200}
              disabled={!isDone}
              onBlur={(e) => {
                if (e.target.value !== (state.proof ?? "")) {
                  const value = e.target.value;
                  startTransition(() => {
                    setProof(item.id, value);
                  });
                }
              }}
              className="w-full mt-2.5 bg-transparent text-ink border-0 border-b border-rule py-1.5 text-s-0 placeholder:text-ink-faint placeholder:italic focus:outline-none focus:border-ink-mid"
            />
          </div>
        </div>

        <div className="mt-1.5">
          <BlogEditor listItemId={item.id} initial={item.blogPost} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={state.visibility}
          disabled={pending}
          aria-label={`Visibility for ${item.title}`}
          data-v={state.visibility}
          onChange={(e) => {
            const next = e.target.value as "private" | "anonymous" | "public";
            const previous = { visibility: state.visibility, reviewState: state.reviewState };
            startTransition(async () => {
              setState({ visibility: next, reviewState: next === "private" ? state.reviewState : "pending_auto" });
              const result = await setVisibility(item.id, next);
              if (result.error && !result.reviewState) {
                // A hard failure (not a moderation rejection) — the update
                // never applied server-side, so the optimistic guess above
                // was wrong. A rejection, by contrast, DID apply (the item
                // really is now public/anonymous + rejected) and should
                // show through, not revert.
                setState(previous);
                toast(result.error);
                return;
              }
              setState({ reviewState: result.reviewState ?? next });
              if (result.error) toast(result.error);
            });
          }}
          className="font-mono text-s-minus-2 uppercase tracking-widest text-ink-faint border border-rule bg-page px-1.5 py-0.5 whitespace-nowrap data-[v=private]:border-dashed"
        >
          <option value="private">private</option>
          {(anonEnabled || state.visibility === "anonymous") && <option value="anonymous">anonymous</option>}
          <option value="public">public</option>
        </select>
        {!isDone && (
          <button
            disabled={pending}
            onClick={() => startTransition(() => { removeListItem(item.id); })}
            className="font-mono text-s-minus-1 text-ink-faint underline disabled:opacity-40"
          >
            Remove
          </button>
        )}
      </div>
      {state.visibility !== "private" && (
        <ModerationStatus
          itemId={item.id}
          reviewState={state.reviewState}
          appealedAt={item.appealedAt}
          createdAt={item.createdAt}
        />
      )}

      {isDone && (
        <div className={`stamp-badge ink-${ink}`} aria-hidden="true">
          <span className="font-display font-extrabold text-s-minus-1 tracking-[0.14em] uppercase block">
            {CATEGORY_LABEL[item.category] ?? item.category}
          </span>
          <span className="font-mono text-s-minus-2 tracking-wide block mt-0.5">
            {formatStampDate(state.completedAt!)} · {code}
          </span>
        </div>
      )}
    </li>
  );
}

const REVIEW_STATE_COPY: Record<string, string> = {
  approved: "Visible to campus.",
  flagged: "Visible to campus. Someone reported it — under a quiet look, nothing pulled.",
  pending_auto: "Waiting on automatic review.",
  pending_human: "Waiting on human review. Usually within 48 hours.",
  rejected: "Didn't pass review, so it's staying private to you.",
  held: "Pulled from view while it's looked at. Reversible — this isn't a final decision.",
  draft: "",
};

function ModerationStatus({
  itemId,
  reviewState,
  appealedAt,
  createdAt,
}: {
  itemId: string;
  reviewState: string;
  appealedAt: string | null;
  createdAt: string;
}) {
  const [appealing, setAppealing] = useState(false);
  const [appealSent, setAppealSent] = useState(Boolean(appealedAt));
  const [converted, setConverted] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const daysPending = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const isStale = reviewState === "pending_human" && daysPending > STALE_PENDING_DAYS;

  return (
    <div className="col-start-2 mt-1">
      <p className="font-mono text-s-minus-2 text-ink-faint">{REVIEW_STATE_COPY[reviewState] ?? ""}</p>

      {isStale && !converted && (
        <div className="mt-1.5">
          <p className="font-mono text-s-minus-2 text-ink-faint">
            Sorry — this is taking longer than the usual 48 hours. Still
            pending, not lost.
          </p>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await convertToNamed(itemId);
                if (result.error && !result.reviewState) {
                  toast(result.error);
                  return;
                }
                setConverted(true);
                toast("Converted to named.");
              })
            }
            className="font-mono text-s-minus-2 text-ink-mid underline mt-1"
          >
            Convert to named instead
          </button>
        </div>
      )}

      {reviewState === "held" && !appealSent && (
        <div className="mt-1.5">
          {!appealing ? (
            <button
              onClick={() => setAppealing(true)}
              className="font-mono text-s-minus-2 text-ink-mid underline"
            >
              Appeal this
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const message = new FormData(e.currentTarget).get("message") as string;
                startTransition(async () => {
                  const result = await fileAppeal(itemId, message);
                  if (result.error) {
                    toast(result.error);
                    return;
                  }
                  setAppealSent(true);
                  toast("Appeal sent.");
                });
              }}
            >
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={1000}
                rows={2}
                placeholder="Why should this be looked at again?"
                className="w-full border border-rule p-2 text-s-minus-1 mt-1"
              />
              <button
                type="submit"
                disabled={pending}
                className="font-mono text-s-minus-2 text-ink-mid underline mt-1 disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send appeal"}
              </button>
            </form>
          )}
        </div>
      )}
      {reviewState === "held" && appealSent && (
        <p className="font-mono text-s-minus-2 text-ink-faint mt-1">Appeal sent — this jumps to the top of the queue.</p>
      )}
    </div>
  );
}
