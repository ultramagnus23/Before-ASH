"use client";

import { useState, useTransition } from "react";
import { submitItem } from "@/lib/submissions/actions";

type Category = { key: string; label: string };

/*
 * The submission form.
 *
 * Deliberately just a title and a category. Difficulty, edge, group size and
 * locale are the curator's to set when approving — asking a submitter to
 * self-assess six dimensions produces six fields of noise, and the curator
 * ends up rewriting them anyway.
 *
 * There is no image field, and that is structural rather than an oversight:
 * `callModel` is text-only, so an image on a published surface could not be
 * screened even in principle. See db/migrations/0017_publishing.sql.
 */
export function SubmitForm({ categories }: { categories: Category[] }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const [result, setResult] = useState<{ kind: "queued" | "rejected" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = title.trim().length >= 4 && category.length > 0;

  return (
    <div className="border border-rule px-5 py-5">
      <label htmlFor="submission-title" className="block font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint mb-1">
        The thing
      </label>
      <input
        id="submission-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setResult(null);
        }}
        maxLength={140}
        placeholder="Write it the way you'd say it to a friend"
        className="w-full bg-transparent border-b border-rule focus:border-ink outline-none py-1 mb-4"
      />

      <label htmlFor="submission-category" className="block font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint mb-1">
        Where it belongs
      </label>
      <select
        id="submission-category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full bg-transparent border-b border-rule focus:border-ink outline-none py-1.5 mb-5 font-mono text-s-minus-1"
      >
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      {result && (
        <p
          role={result.kind === "queued" ? "status" : "alert"}
          className={`font-mono text-s-minus-2 mb-4 ${
            result.kind === "queued" ? "text-ink-faint" : "text-stamp-red"
          }`}
        >
          {result.text}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit || pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const outcome = await submitItem({ title, category });
            if (outcome.status === "queued") {
              setTitle("");
              setResult({ kind: "queued", text: "Sent. It'll be read before it goes anywhere." });
            } else if (outcome.status === "rejected") {
              setResult({ kind: "rejected", text: outcome.reason });
            } else {
              setResult({ kind: "error", text: outcome.message });
            }
          });
        }}
        className="border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        {pending ? "Sending…" : "Send it"}
      </button>
    </div>
  );
}
