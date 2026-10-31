"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "@/lib/boards/actions";

export function InviteForm({ boardId }: { boardId: string }) {
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("contributor");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await inviteMember(boardId, handle, role);
          if (result.error) {
            setError(result.error);
            return;
          }
          setHandle("");
          setError(null);
          setSent(true);
          setTimeout(() => setSent(false), 2000);
        });
      }}
      className="flex flex-wrap gap-2 mb-4"
    >
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        required
        placeholder="handle to invite"
        className="flex-1 min-w-[10rem] border-b border-rule bg-transparent text-s-minus-1 py-1.5"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        aria-label="Role to invite as"
        className="border border-rule px-2 py-1.5 text-s-minus-1"
      >
        <option value="viewer">viewer</option>
        <option value="contributor">contributor</option>
        <option value="editor">editor</option>
      </select>
      <button type="submit" disabled={pending} className="font-mono text-s-minus-1 text-ink-mid underline disabled:opacity-50">
        {pending ? "Inviting…" : sent ? "Sent." : "Invite"}
      </button>
      {error && <p className="font-mono text-s-minus-1 text-error w-full">{error}</p>}
    </form>
  );
}
