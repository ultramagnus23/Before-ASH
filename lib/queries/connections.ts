import "server-only";
import { createClient } from "@/lib/supabase/server";

/*
 * Mutual-consent contact exchange (BUILD-PROMPT.md §5). The asymmetry that
 * matters: the OWNER needs to see who's interested to decide whether to
 * accept — that was never hidden info, "I'm in" is not itself an anonymous
 * gesture. What's actually gated behind mutual consent is the INTERESTED
 * party learning the owner's real handle when the underlying item is
 * anonymous — that's the one piece of information the product otherwise
 * keeps hidden. For a non-anonymous (public) item, the owner's handle is
 * already visible in the feed, so "connecting" there is just a mutual
 * acknowledgment, not an actual reveal of anything new.
 */

export type ConnectionRow = {
  id: string;
  listItemId: string;
  itemTitle: string;
  isAnonymousItem: boolean;
  ownerId: string;
  interestedId: string;
  ownerHandle: string | null; // populated only where safe to show, see getters below
  interestedHandle: string;
  ownerAccepted: boolean;
  interestedAccepted: boolean;
  revokedAt: string | null;
  createdAt: string;
};

// `profiles!interested_id` / `profiles!owner_id` disambiguate via the FK
// COLUMN name, not the constraint name — connections has two FKs to
// profiles, so PostgREST needs a hint either way, and the column name is
// stable regardless of what Drizzle Kit happens to auto-generate the
// constraint's name as.
const SELECT_COLUMNS = `
  id, list_item_id, owner_id, interested_id, owner_accepted, interested_accepted, revoked_at, created_at,
  list_item:list_items(visibility, custom_title, quest:quests(title)),
  interested:profiles!interested_id(handle)
`;

function itemTitleFrom(row: any): string {
  return row.list_item?.quest?.title ?? row.list_item?.custom_title ?? "";
}

export async function getIncomingRequests(userId: string): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select(SELECT_COLUMNS)
    .eq("owner_id", userId)
    .eq("owner_accepted", false)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // The owner deciding whether to accept needs to see who's asking — that
  // was never the hidden part of this feature (see module comment).
  return (data ?? []).map((row: any) => ({
    id: row.id,
    listItemId: row.list_item_id,
    itemTitle: itemTitleFrom(row),
    isAnonymousItem: row.list_item?.visibility === "anonymous",
    ownerId: row.owner_id,
    interestedId: row.interested_id,
    ownerHandle: null, // irrelevant to the owner viewing their own incoming requests
    interestedHandle: row.interested?.handle ?? "",
    ownerAccepted: row.owner_accepted,
    interestedAccepted: row.interested_accepted,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}

export async function getOutgoingRequests(userId: string): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select(SELECT_COLUMNS)
    .eq("interested_id", userId)
    .eq("owner_accepted", false)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Owner's identity stays hidden here even to a technically-privileged
  // query, on purpose — this function is what feeds the "pending" list for
  // the person who asked, and they haven't earned the reveal yet.
  return (data ?? []).map((row: any) => ({
    id: row.id,
    listItemId: row.list_item_id,
    itemTitle: itemTitleFrom(row),
    isAnonymousItem: row.list_item?.visibility === "anonymous",
    ownerId: row.owner_id,
    interestedId: row.interested_id,
    ownerHandle: null,
    interestedHandle: row.interested?.handle ?? "",
    ownerAccepted: row.owner_accepted,
    interestedAccepted: row.interested_accepted,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}

export async function getActiveConnections(userId: string): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select(`${SELECT_COLUMNS}, owner:profiles!owner_id(handle)`)
    .or(`owner_id.eq.${userId},interested_id.eq.${userId}`)
    .eq("owner_accepted", true)
    .eq("interested_accepted", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Both sides accepted — the reveal has happened. Show the counterpart's
  // handle regardless of which side the current user is on.
  return (data ?? []).map((row: any) => ({
    id: row.id,
    listItemId: row.list_item_id,
    itemTitle: itemTitleFrom(row),
    isAnonymousItem: row.list_item?.visibility === "anonymous",
    ownerId: row.owner_id,
    interestedId: row.interested_id,
    ownerHandle: row.owner?.handle ?? null,
    interestedHandle: row.interested?.handle ?? "",
    ownerAccepted: row.owner_accepted,
    interestedAccepted: row.interested_accepted,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}
