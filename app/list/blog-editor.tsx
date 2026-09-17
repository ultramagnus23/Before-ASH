"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

type BlogPost = { body: string; links: { label: string; url: string }[]; reviewState: string } | null;

const REVIEW_NOTE: Record<string, string> = {
  approved: "",
  pending_auto: "Waiting on review before this shows publicly.",
  pending_human: "Waiting on human review before this shows publicly.",
  held: "Waiting on review before this shows publicly.",
  flagged: "Visible, but flagged for a quiet look.",
  rejected: "Didn't pass review — stays private to you.",
};

// Loaded only once someone actually opens the editor. This is the reason
// for the launcher/form split below: with 60 rows on /list, mounting the
// full editor's useState x4 + useTransition for every row (almost none of
// which have a blog post) was measurable hydration cost for a feature
// nobody had opened yet. This component stays out of the initial bundle.
const BlogEditorForm = dynamic(() => import("./blog-editor-form"), { ssr: false });

// §13.1: optional, opt-in, never required to complete the core add/stamp
// flow. Collapsed by default so it never competes visually with the
// item's primary controls. Kept deliberately cheap to hydrate — see
// blog-editor-form.tsx for where the real state lives.
export function BlogEditor({ listItemId, initial }: { listItemId: string; initial: BlogPost }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(initial);

  if (!open && !current) {
    return (
      <button onClick={() => setOpen(true)} className="font-mono text-s-minus-2 text-ink-faint underline">
        Add a write-up
      </button>
    );
  }

  if (!open && current) {
    return (
      <div className="mt-1.5">
        <p className="text-ink-mid text-s-minus-1 whitespace-pre-wrap">{current.body}</p>
        {current.links.length > 0 && (
          <ul className="list-none mt-1 flex flex-wrap gap-3">
            {current.links.map((link, i) => (
              <li key={i}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-mono text-s-minus-2 text-ink-mid underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {current.reviewState && REVIEW_NOTE[current.reviewState] && (
          <p className="font-mono text-s-minus-2 text-ink-faint mt-1">{REVIEW_NOTE[current.reviewState]}</p>
        )}
        <button onClick={() => setOpen(true)} className="font-mono text-s-minus-2 text-ink-faint underline mt-1">
          Edit
        </button>
      </div>
    );
  }

  return (
    <BlogEditorForm
      listItemId={listItemId}
      initial={current}
      onClose={() => setOpen(false)}
      onSaved={setCurrent}
    />
  );
}
