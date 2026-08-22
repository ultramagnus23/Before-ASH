"use client";

import { useTransition } from "react";
import type { BoardMemberRow } from "@/lib/queries/boards";
import { removeMember } from "@/lib/boards/actions";

export function MemberList({ members, myUserId }: { members: BoardMemberRow[]; myUserId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="list-none mb-4">
      {members.map((m) => (
        <li key={m.id} className="flex justify-between items-center py-1.5 border-b border-rule-fine">
          <span className="text-s-minus-1">
            @{m.handle} <span className="font-mono text-s-minus-2 text-ink-faint uppercase">{m.role}</span>
            {m.status === "invited" && <span className="font-mono text-s-minus-2 text-ink-faint"> (pending)</span>}
          </span>
          {m.userId !== myUserId && m.role !== "owner" && (
            <button
              disabled={pending}
              onClick={() => startTransition(() => { removeMember(m.id); })}
              className="font-mono text-s-minus-2 text-ink-faint underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
