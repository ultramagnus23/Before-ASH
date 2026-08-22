"use client";

import { useActionState, useState } from "react";
import { requestMagicLink, type RequestLinkState } from "@/lib/auth/actions";

const initialState: RequestLinkState = {};

export function CoverForm({ allowedDomain }: { allowedDomain: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);
  const [consent, setConsent] = useState(false);

  if (state.sent) {
    return (
      <p className="font-mono text-s-0 text-page/85">
        Link sent. Check your inbox — it expires in a few minutes.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <div className="flex flex-wrap gap-2 items-stretch">
        <input
          type="email"
          name="email"
          required
          placeholder={`you@${allowedDomain}`}
          aria-label="Your Ashoka email"
          className="flex-1 min-w-[15rem] bg-white/5 text-page border border-foil/34 px-4 py-3.5 font-mono text-s-0"
        />
        <input type="hidden" name="consent" value={consent ? "true" : "false"} />
        <button
          type="submit"
          disabled={pending || !consent}
          className="bg-page text-cover-deep font-semibold px-6 py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Sending…" : "Open it"}
        </button>
      </div>

      <label className="flex items-start gap-2 mt-4 text-page/60 text-s-minus-1 font-mono">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I've read the <a href="/terms" className="underline">Terms</a>,{" "}
          <a href="/privacy" className="underline">Privacy</a>, and{" "}
          <a href="/grievance" className="underline">Community rules</a>. Send
          me a link.
        </span>
      </label>

      {state.error && <p className="text-error-on-dark text-s-minus-1 mt-3">{state.error}</p>}

      {/* text-page/60 (~5.9:1), not /45 (~3.9:1, fails WCAG AA at this
          text size) — see BUILD-PROMPT.md §11's contrast pass. */}
      <p className="font-mono text-s-minus-1 text-page/60 mt-4">
        {allowedDomain} addresses only. No password, we send a link.
      </p>
    </form>
  );
}
