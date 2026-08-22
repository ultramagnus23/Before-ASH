"use client";

import { useActionState, useRef } from "react";
import { addCustomItem, type AddCustomItemState } from "@/lib/list-items/actions";

const initialState: AddCustomItemState = {};

// First-class on /list, not tucked behind a tab or secondary to the catalog
// (BUILD-PROMPT.md's catalog non-negotiable) — this is the first thing
// under the header, same visual weight as the list itself.
export function AddCustomForm({ categories }: { categories: { key: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(addCustomItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="border border-rule p-4 mb-8"
    >
      <label className="block font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-2">
        Write your own
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          name="title"
          required
          minLength={3}
          maxLength={140}
          placeholder="Something worth doing that isn't in the index"
          className="flex-1 min-w-[16rem] border-b border-rule bg-transparent py-2 text-s-0"
        />
        <select
          name="category"
          required
          defaultValue=""
          aria-label="Category"
          className="border border-rule px-2 py-2 text-s-minus-1"
        >
          <option value="" disabled>
            Category
          </option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="border border-ink px-4 py-2 font-semibold text-s-minus-1 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add it"}
        </button>
      </div>
      {state.error && <p className="text-error text-s-minus-1 mt-2">{state.error}</p>}
    </form>
  );
}
