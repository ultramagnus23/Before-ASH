"use client";

import { useState, useTransition } from "react";
import { addBoardItem } from "@/lib/boards/actions";

export function AddBoardItemForm({ boardId, categories }: { boardId: string; categories: { key: string; label: string }[] }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addBoardItem(boardId, { title, category });
          if (result.error) {
            setError(result.error);
            return;
          }
          setTitle("");
          setError(null);
        });
      }}
      className="border border-rule p-4 mb-6"
    >
      <label className="block font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-2">
        Suggest something
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={140}
          placeholder="Something for this board"
          className="flex-1 min-w-[16rem] border-b border-rule bg-transparent py-2 text-s-0"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="border border-rule px-2 py-2 text-s-minus-1"
        >
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="border border-ink px-4 py-2 font-semibold text-s-minus-1 disabled:opacity-50">
          {pending ? "Adding…" : "Suggest it"}
        </button>
      </div>
      {error && <p className="font-mono text-s-minus-1 text-error mt-2">{error}</p>}
    </form>
  );
}
