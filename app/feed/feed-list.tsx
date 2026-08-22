"use client";

import { useState, useTransition } from "react";
import type { PublicListItem } from "@/lib/queries/list-items";
import { loadMoreFeed } from "@/lib/feed/actions";
import { FeedRow } from "./feed-row";

export function FeedList({
  initialItems,
  initialCursor,
}: {
  initialItems: PublicListItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <ul className="list-none">
        {items.map((item) => (
          <FeedRow key={item.id} item={item} />
        ))}
      </ul>

      {cursor && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const page = await loadMoreFeed(cursor);
              setItems((prev) => [...prev, ...page.items]);
              setCursor(page.nextCursor);
            })
          }
          className="mt-6 font-mono text-s-minus-1 text-ink-mid border-b border-rule pb-px hover:text-ink hover:border-ink disabled:opacity-50"
        >
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
