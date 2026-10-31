"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { BoardItemRow } from "@/lib/queries/boards";
import { removeBoardItem } from "@/lib/boards/actions";
import { addBoardPost, deleteBoardPost } from "@/lib/item-posts/actions";
import { addFromCatalog, addCustomCopy } from "@/lib/list-items/actions";

export function BoardItemCard({
  item,
  canContribute,
  canAdmin,
}: {
  item: BoardItemRow;
  canContribute: boolean;
  canAdmin: boolean;
}) {
  const passthrough = (_c: boolean, next: boolean) => next;
  const [added, setAdded] = useOptimistic(false, passthrough);
  const [removed, setRemoved] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();

  // Deliberately rendering item.posts directly from props, not mirrored
  // into local state — revalidatePath() after addBoardPost/deleteBoardPost
  // refetches this component's props on the next render, and a separate
  // useState initialized from item.posts would only capture that value on
  // first mount, going stale on every subsequent post/delete from anyone.
  const posts = item.posts;

  if (removed) return null;

  return (
    <li className="py-4 border-b border-rule-fine">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-medium text-s-1 text-ink">{item.title}</h3>
          <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-0.5">
            {item.category.replace(/_/g, " ")} · suggested by @{item.addedByHandle}
          </p>
        </div>
        <div className="flex gap-3 flex-none">
          <button
            disabled={pending || added}
            onClick={() =>
              startTransition(async () => {
                setAdded(true);
                await (item.questId ? addFromCatalog(item.questId) : addCustomCopy(item.title, item.category));
              })
            }
            className="font-mono text-s-minus-1 text-ink-mid underline disabled:opacity-60"
          >
            {added ? "Added." : "Add to my list"}
          </button>
          {(item.isOwn || canAdmin) && (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setRemoved(true);
                  await removeBoardItem(item.id);
                })
              }
              className="font-mono text-s-minus-1 text-ink-faint underline disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {posts.length > 0 && (
        <ul className="list-none mt-2 pl-3 border-l border-rule-fine">
          {posts.map((post) => (
            <li key={post.id} className="py-1.5">
              <span className="font-mono text-s-minus-2 text-ink-faint">@{post.authorHandle}</span>{" "}
              <span className="text-s-minus-1 text-ink-mid">{post.body}</span>
              {(post.isOwn || canAdmin) && (
                <button
                  onClick={() => startTransition(() => { deleteBoardPost(post.id); })}
                  className="font-mono text-s-minus-2 text-ink-faint underline ml-2"
                >
                  delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canContribute && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!commentText.trim()) return;
            startTransition(async () => {
              const result = await addBoardPost(item.id, commentText, "comment");
              if (!result.error) {
                setCommentText("");
              }
            });
          }}
        >
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Say something about this one"
            maxLength={4000}
            className="flex-1 border-b border-rule bg-transparent text-s-minus-1 py-1"
          />
          <button type="submit" disabled={pending} className="font-mono text-s-minus-2 text-ink-mid underline disabled:opacity-50">
            Post
          </button>
        </form>
      )}
    </li>
  );
}
