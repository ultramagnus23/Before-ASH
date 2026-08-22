"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { itemPostSchema } from "@/lib/validation";
import { runModerationPipeline } from "@/lib/moderation/pipeline";
import { z } from "zod";

export type SetBlogPostResult = { error?: string; reviewState?: string };

/*
 * §13.1: the optional longer write-up on your OWN list item. One per item
 * (upsert, not a thread — a personal item isn't a discussion). Visibility
 * inherits the parent: a blog post on a private item is never moderated
 * (never shown to anyone else regardless), one on a public/anonymous item
 * goes through the exact same three-layer pipeline as the item's own
 * title text — free-form user text gets no exemption just because it's
 * "just a blog post," per §13.1's own non-negotiable.
 */
export async function setBlogPost(
  listItemId: string,
  body: string,
  links: { label: string; url: string }[]
): Promise<SetBlogPostResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = itemPostSchema.safeParse({ body, links });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }

  const { data: item } = await supabase
    .from("list_items")
    .select("id, visibility")
    .eq("id", listItemId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!item) return { error: "Couldn't find that item." };

  const isPublicFacing = item.visibility !== "private";
  let reviewState = "draft";

  if (isPublicFacing) {
    const decision = await runModerationPipeline(parsed.data.body, item.visibility === "anonymous");
    reviewState = decision.outcome;
    if (decision.outcome === "rejected") {
      // Still saved — private to the author, same as a rejected item
      // itself — just never shown to anyone else. See BUILD-PROMPT.md §7:
      // "rejected, reason shown," not silently discarded.
      await createServiceRoleClient().from("moderation_log").insert({
        actor: "system",
        action: "reject",
        target_type: "item_post",
        target_id: listItemId,
        reason: decision.reason,
      });
    }
  } else {
    reviewState = "approved"; // private items never need review — never shown to anyone else regardless
  }

  const { data: existing } = await supabase
    .from("item_posts")
    .select("id")
    .eq("list_item_id", listItemId)
    .eq("kind", "blog")
    .maybeSingle();

  const payload = {
    body: parsed.data.body,
    links: parsed.data.links ?? [],
    review_state: reviewState,
  };

  const { error } = existing
    ? await supabase.from("item_posts").update(payload).eq("id", existing.id)
    : await supabase.from("item_posts").insert({
        list_item_id: listItemId,
        author_id: user.id,
        kind: "blog",
        ...payload,
      });

  if (error) return { error: "Couldn't save that." };

  revalidatePath("/list");
  revalidatePath("/feed");
  return { reviewState, error: reviewState === "rejected" ? "Didn't pass review — stays private to you." : undefined };
}

export async function deleteBlogPost(listItemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase
    .from("item_posts")
    .delete()
    .eq("list_item_id", listItemId)
    .eq("author_id", user.id)
    .eq("kind", "blog");

  if (error) return { error: "Couldn't remove that." };
  revalidatePath("/list");
  return {};
}

const boardPostSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(["blog", "comment"]),
});

// §13.3: discussion on a shared board item — contributor role or above,
// enforced by item_posts_insert_authorized in
// db/migrations/0002_boards_and_posts.sql, not re-checked here. Unlike a
// personal item's blog, multiple posts per board item are expected (it's
// a group discussion space), so this is always an insert, never an
// upsert.
export async function addBoardPost(
  boardItemId: string,
  body: string,
  kind: "blog" | "comment"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = boardPostSchema.safeParse({ body, kind });
  if (!parsed.success) return { error: "Invalid post." };

  const { data: boardItem } = await supabase.from("board_items").select("board_id").eq("id", boardItemId).maybeSingle();
  if (!boardItem) return { error: "Item not found." };

  const { error } = await supabase.from("item_posts").insert({
    board_item_id: boardItemId,
    author_id: user.id,
    kind: parsed.data.kind,
    body: parsed.data.body,
    review_state: "approved", // boards are membership-gated, not campus-public — no moderation pipeline needed here, same reasoning as any private-visibility content
  });

  if (error) return { error: "Couldn't post — you may need contributor access." };

  revalidatePath(`/boards/${boardItem.board_id}`);
  return {};
}

export async function deleteBoardPost(postId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: post } = await supabase
    .from("item_posts")
    .select("board_item:board_items(board_id)")
    .eq("id", postId)
    .maybeSingle();

  const { error } = await supabase.from("item_posts").delete().eq("id", postId);
  if (error) return { error: "Couldn't delete that." };

  const boardId = (post as any)?.board_item?.board_id;
  if (boardId) revalidatePath(`/boards/${boardId}`);
  return {};
}
