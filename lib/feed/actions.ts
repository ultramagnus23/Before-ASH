"use server";

import { getFeedPage, type FeedPage } from "@/lib/queries/list-items";

// Thin "use server" wrapper so the client-side load-more component can call
// straight into the same RLS-respecting query the RSC first page uses —
// lib/queries/list-items.ts stays "server-only" (Server Component reads),
// this file is the "use server" (client-callable action) boundary on top.
export async function loadMoreFeed(cursor: string): Promise<FeedPage> {
  return getFeedPage(cursor);
}
