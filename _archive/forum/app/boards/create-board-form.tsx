"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoard } from "@/lib/boards/actions";

export function CreateBoardForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="border border-ink px-4 py-2 font-semibold text-s-minus-1 mb-10">
        Start a board
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await createBoard({ name, description, discoverable });
          if (result.error) {
            setError(result.error);
            return;
          }
          if (result.boardId) router.push(`/boards/${result.boardId}`);
        });
      }}
      className="border border-rule p-4 mb-10"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={3}
        maxLength={80}
        placeholder="Board name"
        className="w-full border-b border-rule bg-transparent py-2 text-s-0 mb-2"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="What's this for (optional)"
        className="w-full border border-rule p-2 text-s-minus-1 mb-2"
      />
      <label className="flex items-center gap-2 text-s-minus-1 text-ink-mid mb-3">
        <input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
        Looking for people — let others find and request to join
      </label>
      {error && <p className="font-mono text-s-minus-1 text-error mb-2">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="border border-ink px-4 py-2 font-semibold text-s-minus-1 disabled:opacity-50">
          {pending ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-mono text-s-minus-1 text-ink-faint">
          Cancel
        </button>
      </div>
    </form>
  );
}
