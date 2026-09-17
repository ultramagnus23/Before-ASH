"use client";

import { useState, useTransition } from "react";
import { setBlogPost, deleteBlogPost } from "@/lib/item-posts/actions";
import { useToast } from "./toast";

type BlogPost = { body: string; links: { label: string; url: string }[]; reviewState: string } | null;

// The actual editing UI, split out of blog-editor.tsx so it's only loaded
// (via next/dynamic) once someone clicks "Add a write-up" / "Edit" — see
// that file for why. Owns all the state that only matters while open.
export function BlogEditorForm({
  listItemId,
  initial,
  onClose,
  onSaved,
}: {
  listItemId: string;
  initial: BlogPost;
  onClose: () => void;
  onSaved: (post: BlogPost) => void;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial?.links ?? []);
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
      onSaved(body ? { body, links: cleanLinks, reviewState: result.reviewState ?? "" } : null);
      toast(body ? "Saved." : "Removed.");
    });
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
                onSaved(null);
                onClose();
                toast("Removed.");
              })
            }
            className="font-mono text-s-minus-1 text-error"
          >
            Delete
          </button>
        )}
        <button onClick={onClose} className="font-mono text-s-minus-1 text-ink-faint">
          Close
        </button>
      </div>
    </div>
  );
}

export default BlogEditorForm;
