"use client";

import { useRef, useState, useTransition } from "react";
import { addCustomItem, type AddCustomItemState } from "@/lib/list-items/actions";

// First-class on /list, not tucked behind a tab or secondary to the catalog
// (BUILD-PROMPT.md's catalog non-negotiable) — this is the first thing
// under the header, same visual weight as the list itself.
//
// NOT a useActionState + <form action={formAction}> form, unlike this
// codebase's other forms (cover-form.tsx, onboarding, bio-form) — found
// live, reproduced under Playwright repeatedly: a native <form>-submitted
// Server Action that calls revalidatePath on the SAME path it's rendered
// on (addCustomItem revalidates "/list", called from a form living on
// "/list") hangs indefinitely — the submit button gets stuck disabled on
// "Adding…" forever, matching exactly what README.md documented as "still
// open." markDone and addFromCatalog also self-revalidate "/list" and
// never hang, because they're called as plain functions from a button's
// onClick (via startTransition), never through a native <form> submission
// — that's the actual variable, not self-revalidation itself. This form
// is on the SAME "must never break" tier as those two (BUILD-PROMPT.md
// #20's custom-item-entry guarantee), so it now uses their same
// direct-call pattern instead of chasing the form-submission bug further.
export function AddCustomForm({ categories }: { categories: { key: string; label: string }[] }) {
  const [state, setState] = useState<AddCustomItemState>({});
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addCustomItem(state, formData);
      setState(result);
      if (result.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border border-rule p-4 mb-8">
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
