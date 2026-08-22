"use client";

import { useState } from "react";

export function DeleteAccountButton() {
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const res = await fetch("/api/account/delete", { method: "POST" });
    const body = await res.json();
    setResult(body.message ?? body.error);
    if (body.recoveryUrl) {
      // TODO(P6/P7): this is shown here only because no email provider is
      // wired in yet — see the TODO in app/api/account/delete/route.ts.
      setResult(`${body.message} Recovery link (copy it now, it is not emailed yet): ${body.recoveryUrl}`);
    }
  }

  if (result) {
    return <p className="font-mono text-s-minus-1 text-ink-mid break-all">{result}</p>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="font-mono text-s-minus-1 text-error underline"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="border border-rule p-4">
      <p className="text-s-minus-1 text-ink-mid mb-3">
        This hard-deletes your account and everything in it after a 30-day
        recovery window. Sure?
      </p>
      <div className="flex gap-3">
        <button onClick={handleDelete} className="font-semibold text-error">
          Yes, delete it
        </button>
        <button onClick={() => setConfirming(false)} className="text-ink-faint">
          Never mind
        </button>
      </div>
    </div>
  );
}
