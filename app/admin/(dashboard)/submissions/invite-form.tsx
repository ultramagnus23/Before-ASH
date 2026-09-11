"use client";

import { useState, useTransition } from "react";
import { inviteToPublish } from "@/lib/admin/submission-actions";

/*
 * The door. Submitting is invite-only, and this is the only way through it.
 *
 * There is no list of who has been invited rendered here or anywhere else:
 * the RLS policy lets someone see their own invite and nobody else's, so an
 * invite list never becomes a visible in-group.
 */
export function InviteForm() {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border border-rule px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint">let someone submit</span>
      <input
        value={handle}
        onChange={(e) => {
          setHandle(e.target.value);
          setMessage(null);
        }}
        placeholder="handle"
        aria-label="Handle to invite"
        className="bg-transparent border-b border-rule focus:border-ink outline-none py-1 font-mono text-s-minus-1 w-[16ch]"
      />
      <button
        type="button"
        disabled={handle.trim().length === 0 || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await inviteToPublish(handle);
            if (result.error) {
              setMessage({ ok: false, text: result.error });
              return;
            }
            setHandle("");
            setMessage({ ok: true, text: "Done." });
          })
        }
        className="font-mono text-s-minus-1 border border-ink px-3 py-1 hover:bg-ink hover:text-page disabled:opacity-40"
      >
        {pending ? "…" : "Invite"}
      </button>
      {message && (
        <span
          role={message.ok ? "status" : "alert"}
          className={`font-mono text-s-minus-2 ${message.ok ? "text-ink-faint" : "text-stamp-red"}`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
