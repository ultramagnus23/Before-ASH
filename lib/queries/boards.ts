import "server-only";
import { createClient } from "@/lib/supabase/server";

/*
 * §13.3: shared boards. Completion/stamping never lives here — a board
 * item is a suggestion; "doing" one means adding it to your own list,
 * which creates a normal list_items row via the exact same
 * addFromCatalog/addCustomCopy actions /explore and /feed already use.
 */

export type BoardRole = "owner" | "editor" | "contributor" | "viewer";

export type MyBoard = { id: string; name: string; description: string | null; role: BoardRole; discoverable: boolean };

export async function getMyBoards(userId: string): Promise<MyBoard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_members")
    .select("role, board:boards(id, name, description, discoverable)")
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.board)
    .map((row: any) => ({
      id: row.board.id,
      name: row.board.name,
      description: row.board.description,
      role: row.role,
      discoverable: row.board.discoverable,
    }));
}

export type PendingInvite = { boardMemberId: string; boardId: string; boardName: string; role: BoardRole; invitedByHandle: string | null };

export async function getPendingInvites(userId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_members")
    .select("id, role, board:boards(id, name), inviter:profiles!invited_by(handle)")
    .eq("user_id", userId)
    .eq("status", "invited");

  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.board)
    .map((row: any) => ({
      boardMemberId: row.id,
      boardId: row.board.id,
      boardName: row.board.name,
      role: row.role,
      invitedByHandle: row.inviter?.handle ?? null,
    }));
}

export type DiscoverableBoard = { id: string; name: string; description: string | null; alreadyRequested: boolean };

export async function getDiscoverableBoards(userId: string): Promise<DiscoverableBoard[]> {
  const supabase = await createClient();
  const [{ data: boards, error }, { data: myBoardIds }, { data: myRequests }] = await Promise.all([
    supabase.from("boards").select("id, name, description").eq("discoverable", true),
    supabase.from("board_members").select("board_id").eq("user_id", userId),
    supabase.from("board_join_requests").select("board_id").eq("user_id", userId).eq("status", "pending"),
  ]);
  if (error) throw error;

  const memberBoardIds = new Set((myBoardIds ?? []).map((r) => r.board_id));
  const requestedBoardIds = new Set((myRequests ?? []).map((r) => r.board_id));

  return (boards ?? [])
    .filter((b) => !memberBoardIds.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, description: b.description, alreadyRequested: requestedBoardIds.has(b.id) }));
}

export type BoardDetail = {
  id: string;
  name: string;
  description: string | null;
  discoverable: boolean;
  myRole: BoardRole | null;
};

export async function getBoardDetail(boardId: string, userId: string): Promise<BoardDetail | null> {
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("boards")
    .select("id, name, description, discoverable")
    .eq("id", boardId)
    .maybeSingle();
  if (!board) return null;

  const { data: membership } = await supabase
    .from("board_members")
    .select("role")
    .eq("board_id", boardId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();

  return { ...board, myRole: membership?.role ?? null };
}

export type BoardItemRow = {
  id: string;
  questId: string | null;
  title: string;
  category: string;
  addedByHandle: string;
  isOwn: boolean;
  posts: { id: string; kind: "blog" | "comment"; body: string; authorHandle: string; isOwn: boolean }[];
};

export async function getBoardItems(boardId: string, userId: string): Promise<BoardItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_items")
    .select(
      "id, quest_id, custom_title, category, added_by, quest:quests(title), adder:profiles!added_by(handle), item_posts(id, kind, body, author_id, author:profiles!author_id(handle))"
    )
    .eq("board_id", boardId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    questId: row.quest_id,
    title: row.quest?.title ?? row.custom_title ?? "",
    category: row.category,
    addedByHandle: row.adder?.handle ?? "",
    isOwn: row.added_by === userId,
    posts: (row.item_posts ?? []).map((p: any) => ({
      id: p.id,
      kind: p.kind,
      body: p.body,
      authorHandle: p.author?.handle ?? "",
      isOwn: p.author_id === userId,
    })),
  }));
}

export type BoardMemberRow = { id: string; userId: string; handle: string; role: BoardRole; status: string };

export async function getBoardMembers(boardId: string): Promise<BoardMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_members")
    .select("id, user_id, role, status, profile:profiles!user_id(handle)")
    .eq("board_id", boardId);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    handle: row.profile?.handle ?? "",
    role: row.role,
    status: row.status,
  }));
}

export type BoardJoinRequestRow = { id: string; userId: string; handle: string; message: string | null };

export async function getBoardJoinRequests(boardId: string): Promise<BoardJoinRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_join_requests")
    .select("id, user_id, message, requester:profiles!user_id(handle)")
    .eq("board_id", boardId)
    .eq("status", "pending");

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    handle: row.requester?.handle ?? "",
    message: row.message,
  }));
}
