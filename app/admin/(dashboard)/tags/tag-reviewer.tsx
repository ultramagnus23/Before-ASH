"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { TagReviewItem } from "@/lib/queries/tags";
import { commitTagReview } from "@/lib/admin/tag-actions";
import {
  TIME_OF_DAY,
  DAY_OF_WEEK,
  DURATION,
  SETTING,
  COST_BAND,
  SEASON,
  GROUP_SIZE,
  DIMENSIONS,
  type Dimension,
  type QuestTags,
} from "@/lib/tags/dimensions";

/*
 * Keyboard-driven, because the job is 491 items and a mouse makes that a
 * different job. The whole interaction is:
 *
 *   j / k or arrow down/up   move between the seven dimensions
 *   1 - 4                    set (or toggle, if multi-valued) a value
 *   Enter                    confirm the item and advance
 *   s                        skip -- leaves it in the queue, unreviewed
 *
 * There is no "reject". A proposal is a starting point, not a submission:
 * the reviewer's job is to correct it, and every item eventually gets
 * confirmed. Skipping is for "not now", which is a different thing.
 *
 * Confirms fire in the background and the UI advances immediately. If a
 * save fails the item is pushed back into the list with the error attached,
 * rather than silently disappearing -- at this volume a lost item would
 * never be noticed.
 */

const VALUES: Record<Dimension, readonly string[]> = {
  time_of_day: TIME_OF_DAY,
  day_of_week: DAY_OF_WEEK,
  duration: DURATION,
  setting: SETTING,
  cost_band: COST_BAND,
  season: SEASON,
  group_size: GROUP_SIZE,
};

const MULTI: Dimension[] = ["time_of_day", "day_of_week"];

const LABEL: Record<Dimension, string> = {
  time_of_day: "When",
  day_of_week: "Days",
  duration: "How long",
  setting: "Where",
  cost_band: "Cost",
  season: "Season",
  group_size: "Who",
};

function pretty(value: string) {
  return value.replace(/_/g, " ");
}

export function TagReviewer({ items }: { items: TagReviewItem[] }) {
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState(0);
  const [tags, setTags] = useState<QuestTags | null>(items[0]?.tags ?? null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const current = queue[index];

  // Reset the working copy whenever the item changes. Editing `current.tags`
  // in place would mutate the row we push back on failure.
  useEffect(() => {
    setTags(current ? { ...current.tags } : null);
    setFocus(0);
  }, [current]);

  const setValue = useCallback(
    (dimension: Dimension, value: string) => {
      setTags((prev) => {
        if (!prev) return prev;
        if (!MULTI.includes(dimension)) {
          return { ...prev, [dimension]: value } as QuestTags;
        }
        const list = prev[dimension] as string[];
        const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
        // The column forbids an empty array and Tonight would silently drop
        // the item, so the last selected value cannot be toggled off.
        if (next.length === 0) return prev;
        return { ...prev, [dimension]: next } as QuestTags;
      });
    },
    []
  );

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setError(null);
  }, []);

  const confirm = useCallback(() => {
    if (!current || !tags) return;
    const item = current;
    advance();
    startTransition(async () => {
      const result = await commitTagReview({ questId: item.questId, ...tags });
      if (result.error) {
        setError(`${item.title}: ${result.error}`);
        setQueue((q) => [...q, item]);
      }
    });
  }, [current, tags, advance]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocus((f) => (f + 1) % DIMENSIONS.length);
      } else if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocus((f) => (f - 1 + DIMENSIONS.length) % DIMENSIONS.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        confirm();
      } else if (key === "s") {
        event.preventDefault();
        advance();
      } else if (/^[1-9]$/.test(key)) {
        const dimension = DIMENSIONS[focus];
        const value = dimension ? VALUES[dimension][Number(key) - 1] : undefined;
        if (dimension && value) {
          event.preventDefault();
          setValue(dimension, value);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, confirm, advance, setValue]);

  if (!current || !tags) {
    return (
      <p className="text-ink-mid">
        Nothing left in this batch. Reload for the next 25.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 border border-stamp-red px-3 py-2 font-mono text-s-minus-1">
          {error} — requeued at the end.
        </p>
      )}

      <div className="border border-rule px-5 py-4 mb-5">
        <p className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint">
          {pretty(current.category)}
        </p>
        <h2 className="font-display font-medium text-s-1 leading-[1.25] mt-1">{current.title}</h2>
        {current.weakest.length > 0 && (
          <p className="font-mono text-s-minus-2 text-ink-faint mt-2">
            model unsure of: {current.weakest.map(pretty).join(", ")}
          </p>
        )}
      </div>

      <ul className="list-none">
        {DIMENSIONS.map((dimension, i) => {
          const selected = tags[dimension];
          const isFocused = i === focus;
          return (
            <li
              key={dimension}
              className={`flex items-baseline gap-3 py-2 px-2 border-l-2 ${
                isFocused ? "border-ink bg-ink/[0.04]" : "border-transparent"
              }`}
            >
              <span className="font-mono text-s-minus-1 uppercase tracking-wide text-ink-faint w-[7rem] flex-none">
                {LABEL[dimension]}
              </span>
              <span className="flex flex-wrap gap-2">
                {VALUES[dimension].map((value, vi) => {
                  const on = Array.isArray(selected) ? selected.includes(value as never) : selected === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setFocus(i);
                        setValue(dimension, value);
                      }}
                      className={`font-mono text-s-minus-1 px-2 py-1 border ${
                        on ? "bg-ink text-page border-ink" : "border-rule text-ink-mid hover:border-ink"
                      }`}
                    >
                      <span className="text-ink-faint mr-1.5">{vi + 1}</span>
                      {pretty(value)}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="font-mono text-s-minus-2 text-ink-faint mt-6 uppercase tracking-wide">
        j/k move · 1-4 set · enter confirm · s skip
      </p>
    </div>
  );
}
