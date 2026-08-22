"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const boardSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(280).optional(),
  discoverable: z.boolean(),
});

export type CreateBoardResult = { error?: string; boardId?: string };

export async function createBoard(input: {
  name: string;
  description?: string;
  discoverable: boolean;
}): Promise<CreateBoardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = boardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid board." };

  const { data: board, error } = await supabase
    .from("boards")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      discoverable: parsed.data.discoverable,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !board) return { error: "Couldn't create that board." };

  // The creator's own owner row — RLS's board_members_insert_admin_invite
  // policy explicitly allows exactly this shape (role='owner', board_id
  // one you just created) so a board is never left without an owner.
  const { error: memberError } = await supabase.from("board_members").insert({
    board_id: board.id,
    user_id: user.id,
    role: "owner",
    status: "accepted",
  });
  if (memberError) return { error: "Board created, but couldn't set you as owner. Contact support." };

  revalidatePath("/boards");
  return { boardId: board.id };
}

const roleSchema = z.enum(["viewer", "contributor", "editor"]);

export type InviteMemberResult = { error?: string };

export async function inviteMember(boardId: string, handle: string, role: string): Promise<InviteMemberResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { error: "Invalid role." };

  const { data: target } = await supabase.from("profiles").select("id").eq("handle", handle.trim()).maybeSingle();
  if (!target) return { error: "No one with that handle." };

  const { error } = await supabase.from("board_members").insert({
    board_id: boardId,
    user_id: target.id,
    role: parsedRole.data,
    status: "invited",
    invited_by: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "Already invited or a member." };
    return { error: "Couldn't invite — you may not have permission on this board." };
  }

  revalidatePath(`/boards/${boardId}`);
  return {};
}

export async function respondToInvite(boardMemberId: string, accept: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  if (!accept) {
    const { error } = await supabase.from("board_members").delete().eq("id", boardMemberId).eq("user_id", user.id);
    if (error) return { error: "Couldn't decline." };
    revalidatePath("/boards");
    return {};
  }

  const { error } = await supabase
    .from("board_members")
    .update({ status: "accepted" })
    .eq("id", boardMemberId)
    .eq("user_id", user.id);
  if (error) return { error: "Couldn't accept." };
  revalidatePath("/boards");
  return {};
}

export async function removeMember(boardMemberId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: member } = await supabase.from("board_members").select("board_id").eq("id", boardMemberId).maybeSingle();
  const { error } = await supabase.from("board_members").delete().eq("id", boardMemberId);
  if (error) return { error: "Couldn't remove that member." };
  if (member) revalidatePath(`/boards/${member.board_id}`);
  return {};
}

const boardItemSchema = z.object({
  title: z.string().trim().min(3).max(140),
  category: z.string().min(1),
});

export async function addBoardItem(
  boardId: string,
  input: { questId?: string; title?: string; category: string }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const row: Record<string, unknown> = { board_id: boardId, added_by: user.id, category: input.category };

  if (input.questId) {
    row.quest_id = input.questId;
  } else {
    const parsed = boardItemSchema.safeParse({ title: input.title, category: input.category });
    if (!parsed.success) return { error: "Invalid item." };
    row.custom_title = parsed.data.title;
  }

  const { error } = await supabase.from("board_items").insert(row);
  if (error) return { error: "Couldn't add — you may need contributor access on this board." };

  revalidatePath(`/boards/${boardId}`);
  return {};
}

export async function removeBoardItem(boardItemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: item } = await supabase.from("board_items").select("board_id").eq("id", boardItemId).maybeSingle();
  const { error } = await supabase.from("board_items").delete().eq("id", boardItemId);
  if (error) return { error: "Couldn't remove that item." };
  if (item) revalidatePath(`/boards/${item.board_id}`);
  return {};
}

export async function requestToJoinBoard(boardId: string, message: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = z.string().trim().max(280).safeParse(message);
  const { error } = await supabase.from("board_join_requests").insert({
    board_id: boardId,
    user_id: user.id,
    message: parsed.success ? parsed.data || null : null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Already requested." };
    return { error: "Couldn't send that request — this board may not be discoverable." };
  }

  revalidatePath("/boards");
  return {};
}

export async function respondToJoinRequest(
  requestId: string,
  accept: boolean,
  role: string = "contributor"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: request } = await supabase
    .from("board_join_requests")
    .select("board_id, user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Not found." };

  if (accept) {
    const parsedRole = roleSchema.safeParse(role);
    const { error: memberError } = await supabase.from("board_members").insert({
      board_id: request.board_id,
      user_id: request.user_id,
      role: parsedRole.success ? parsedRole.data : "contributor",
      status: "accepted",
      invited_by: user.id,
    });
    if (memberError) return { error: "Couldn't add them — you may not have permission." };
  }

  const { error } = await supabase
    .from("board_join_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);
  if (error) return { error: "Couldn't update that request." };

  revalidatePath(`/boards/${request.board_id}`);
  return {};
}
