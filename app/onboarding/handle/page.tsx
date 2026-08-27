"use client";

import { useActionState } from "react";
import { claimHandle, type ClaimHandleState } from "@/lib/auth/actions";

const initialState: ClaimHandleState = {};

export default function ClaimHandlePage() {
  const [state, formAction, pending] = useActionState(claimHandle, initialState);

  return (
    <main className="cover-shell guilloche relative min-h-screen flex items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm">
        <p className="font-mono text-s-minus-1 tracking-[0.16em] uppercase text-foil-dim mb-3">You&rsquo;re in.</p>
        <h1 className="font-display font-extrabold text-s-2 text-page mb-2">Pick a handle</h1>
        <p className="text-page/60 text-s-minus-1 mb-6">
          Lowercase, numbers, underscores. 3 to 20 characters. This is how
          people find you if you ever go public on something — you can stay
          private forever if you&apos;d rather.
        </p>
        <input
          name="handle"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_]+"
          placeholder="your_handle"
          autoFocus
          className="w-full bg-white/5 text-page border border-foil/34 px-4 py-3 font-mono text-s-0 mb-3"
        />
        {state.error && <p className="text-error-on-dark text-s-minus-1 mb-3">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-page text-cover-deep font-semibold px-6 py-3 transition-[background-color,transform] duration-150 hover:bg-foil active:translate-y-px disabled:opacity-50 disabled:hover:bg-page disabled:active:translate-y-0"
        >
          {pending ? "Claiming…" : "Claim it"}
        </button>
      </form>
    </main>
  );
}
