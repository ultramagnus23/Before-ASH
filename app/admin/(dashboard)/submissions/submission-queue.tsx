"use client";

import { useState, useTransition } from "react";
import { approveSubmission, rejectSubmission } from "@/lib/admin/submission-actions";
import type { SubmissionRow } from "@/lib/queries/submissions";

type Category = { key: string; label: string };

const GROUP_SIZES = ["solo", "duo", "group", "any"] as const;
const LOCALES = ["campus", "ncr", "anywhere", "any"] as const;
const LEVELS = [1, 2, 3] as const;

/*
 * One submission at a time, with the dimensions the submitter was not asked
 * for. The submitted title and category are a proposal — both are editable
 * here, because the alternative is rejecting good ideas over wording.
 *
 * "Held because the classifier could not run" and "held because the
 * classifier was unsure" are shown differently. With AI_ENABLED false in
 * production, everything currently arrives as the former, and reading that
 * as a borderline score would be exactly wrong.
 */
export function SubmissionQueue({ items, categories }: { items: SubmissionRow[]; categories: Category[] }) {
  const [queue, setQueue] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const current = queue[0];
  const [title, setTitle] = useState(current?.title ?? "");
  const [category, setCategory] = useState(current?.category ?? "");
  const [difficulty, setDifficulty] = useState<number>(1);
  const [spice, setSpice] = useState<number>(1);
  const [groupSize, setGroupSize] = useState<(typeof GROUP_SIZES)[number]>("any");
  const [locale, setLocale] = useState<(typeof LOCALES)[number]>("campus");

  function advance() {
    setQueue((q) => {
      const next = q.slice(1);
      const head = next[0];
      setTitle(head?.title ?? "");
      setCategory(head?.category ?? "");
      setDifficulty(1);
      setSpice(1);
      setGroupSize("any");
      setLocale("campus");
      return next;
    });
  }

  if (!current) {
    return <p className="text-ink-mid mt-8">Queue clear.</p>;
  }

  const unscored = current.scores === null;

  return (
    <div className="mt-8">
      {error && (
        <p role="alert" className="mb-4 border border-stamp-red px-3 py-2 font-mono text-s-minus-1">
          {error}
        </p>
      )}

      <div className="border border-rule px-5 py-4">
        <p className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint mb-2">
          from {current.submitterHandle}
          {" · "}
          {unscored ? "classifier did not run — not a borderline score" : "classifier passed it to you"}
        </p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          aria-label="Title"
          className="w-full bg-transparent border-b border-rule focus:border-ink outline-none py-1 mb-4 font-display text-s-1"
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-s-minus-1">
          <label className="flex flex-col gap-1">
            <span className="text-ink-faint uppercase tracking-wide text-s-minus-2">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-transparent border-b border-rule focus:border-ink outline-none py-1"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-faint uppercase tracking-wide text-s-minus-2">Where</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
              className="bg-transparent border-b border-rule focus:border-ink outline-none py-1"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-faint uppercase tracking-wide text-s-minus-2">Who</span>
            <select
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value as (typeof GROUP_SIZES)[number])}
              className="bg-transparent border-b border-rule focus:border-ink outline-none py-1"
            >
              {GROUP_SIZES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-6">
            <label className="flex flex-col gap-1">
              <span className="text-ink-faint uppercase tracking-wide text-s-minus-2">Effort</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="bg-transparent border-b border-rule focus:border-ink outline-none py-1"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-faint uppercase tracking-wide text-s-minus-2">Edge</span>
              <select
                value={spice}
                onChange={(e) => setSpice(Number(e.target.value))}
                className="bg-transparent border-b border-rule focus:border-ink outline-none py-1"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={() => {
              setError(null);
              const item = current;
              const payload = {
                submissionId: item.id,
                title,
                category,
                difficulty,
                spice,
                groupSize,
                locale,
              };
              advance();
              startTransition(async () => {
                const outcome = await approveSubmission(payload);
                if (outcome.error) {
                  setError(`${item.title}: ${outcome.error}`);
                  setQueue((q) => [...q, item]);
                }
              });
            }}
            className="border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold hover:bg-ink hover:text-page"
          >
            Take it
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              const item = current;
              advance();
              startTransition(async () => {
                const outcome = await rejectSubmission(item.id);
                if (outcome.error) {
                  setError(`${item.title}: ${outcome.error}`);
                  setQueue((q) => [...q, item]);
                }
              });
            }}
            className="border border-rule px-4 py-2 font-mono text-s-minus-1 text-ink-mid hover:border-ink hover:text-ink"
          >
            Pass
          </button>
        </div>
      </div>
    </div>
  );
}
