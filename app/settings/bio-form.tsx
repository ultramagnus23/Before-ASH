"use client";

import { useActionState, useState } from "react";
import { updateBio, type UpdateBioState } from "@/lib/auth/actions";

const initialState: UpdateBioState = {};

export function BioForm({
  initialBio,
  initialVisible,
}: {
  initialBio: string;
  initialVisible: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBio, initialState);
  const [visible, setVisible] = useState(initialVisible);

  return (
    <form action={formAction} className="max-w-md">
      <label className="block text-s-minus-1 text-ink-faint uppercase tracking-wide mb-2">
        Bio (optional, 140 characters, no links or handles)
      </label>
      <textarea
        name="bio"
        maxLength={280}
        defaultValue={initialBio}
        rows={3}
        className="w-full border border-rule p-3 text-s-0 mb-3"
      />
      <input type="hidden" name="bio_visible" value={visible ? "true" : "false"} />
      <label className="flex items-center gap-2 text-s-minus-1 text-ink-mid mb-4">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Show this on my profile (off by default)
      </label>
      {state.error && <p className="text-error text-s-minus-1 mb-3">{state.error}</p>}
      {state.saved && <p className="text-ink-mid text-s-minus-1 mb-3">Saved.</p>}
      <button type="submit" disabled={pending} className="border border-ink px-5 py-2 font-semibold">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
