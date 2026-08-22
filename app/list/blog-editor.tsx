"use client";

import { useState, useTransition } from "react";
import { setBlogPost, deleteBlogPost } from "@/lib/item-posts/actions";
import { useToast } from "./toast";

type BlogPost = { body: string; links: { label: string; url: string }[]; reviewState: string } | null;

const REVIEW_NOTE: Record<string, string> = {
  approved: "",
  pending_auto: "Waiting on review before this shows publicly.",
  pending_human: "Waiting on human review before this shows publicly.",
  held: "Waiting on review before this shows publicly.",
  flagged: "Visible, but flagged for a quiet look.",
  rejected: "Didn't pass review — stays private to you.",
};

// §13.1: optional, opt-in, never required to complete the core add/stamp
// flow. Collapsed by default so it never competes visually with the
// item's primary controls.
export function BlogEditor({ listItemId, initial }: { listItemId: string; initial: BlogPost }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(initial?.body ?? "");
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial?.links ?? []);
  const [reviewState, setReviewState] = useState(initial?.reviewState ?? null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function addLinkField() {
    if (links.length >= 5) return;
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function save() {
    startTransition(async () => {
      const cleanLinks = links.filter((l) => l.label.trim() && l.url.trim());
      const result = await setBlogPost(listItemId, body, cleanLinks);
      if (result.error && !result.reviewState) {
        toast(result.error);
        return;
      }
      setReviewState(result.reviewState ?? null);
      toast(body ? "Saved." : "Removed.");
    });
  }

  if (!open && !initial) {
    return (
      <button onClick={() => setOpen(true)} className="font-mono text-s-minus-2 text-ink-faint underline">
        Add a write-up
      </button>
    );
  }

  if (!open && initial) {
    return (
      <div className="mt-1.5">
        <p className="text-ink-mid text-s-minus-1 whitespace-pre-wrap">{initial.body}</p>
        {initial.links.length > 0 && (
          <ul className="list-none mt-1 flex flex-wrap gap-3">
            {initial.links.map((link, i) => (
              <li key={i}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-mono text-s-minus-2 text-ink-mid underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {reviewState && REVIEW_NOTE[reviewState] && (
          <p className="font-mono text-s-minus-2 text-ink-faint mt-1">{REVIEW_NOTE[reviewState]}</p>
        )}
        <button onClick={() => setOpen(true)} className="font-mono text-s-minus-2 text-ink-faint underline mt-1">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 border border-rule p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        rows={4}
        placeholder="Write as much as you want about this one"
        className="w-full border-0 bg-transparent text-s-minus-1 mb-2 focus:outline-none"
      />

      {links.map((link, i) => (
        <div key={i} className="flex gap-2 mb-1.5">
          <input
            value={link.label}
            onChange={(e) => setLinks((prev) => prev.map((l, li) => (li === i ? { ...l, label: e.target.value } : l)))}
            placeholder="Label (e.g. Instagram)"
            maxLength={40}
            className="w-32 border-b border-rule bg-transparent text-s-minus-2 py-1"
          />
          <input
            value={link.url}
            onChange={(e) => setLinks((prev) => prev.map((l, li) => (li === i ? { ...l, url: e.target.value } : l)))}
            placeholder="https://…"
            className="flex-1 border-b border-rule bg-transparent text-s-minus-2 py-1"
          />
          <button onClick={() => setLinks((prev) => prev.filter((_, li) => li !== i))} className="font-mono text-s-minus-2 text-ink-faint">
            Remove
          </button>
        </div>
      ))}

      {links.length < 5 && (
        <button onClick={addLinkField} className="font-mono text-s-minus-2 text-ink-faint underline mb-2 block">
          + Add a link
        </button>
      )}

      <div className="flex gap-3 mt-2">
        <button onClick={save} disabled={pending} className="border border-ink px-3 py-1.5 font-semibold text-s-minus-1 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {initial && (
          <button
            onClick={() =>
              startTransition(async () => {
                await deleteBlogPost(listItemId);
                setBody("");
                setLinks([]);
                setOpen(false);
                toast("Removed.");
              })
            }
            className="font-mono text-s-minus-1 text-error"
          >
            Delete
          </button>
        )}
        <button onClick={() => setOpen(false)} className="font-mono text-s-minus-1 text-ink-faint">
          Close
        </button>
      </div>
    </div>
  );
}
