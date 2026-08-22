"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export type ExpressInterestResult = { error?: string; ok?: boolean };

// "I'm in" on someone else's public/anonymous item. Records the interest
// (idempotent — the unique (list_item_id, user_id) index makes a repeat
// click harmless) and opens a connections row with the interested side
// already accepted, since clicking "I'm in" IS that side's consent. The
// owner still has to accept before any reveal happens — see
// BUILD-PROMPT.md §5 and lib/queries/connections.ts for what's actually
// gated behind that.
export async function expressInterest(listItemId: string): Promise<ExpressInterestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: item, error: itemError } = await supabase
    .from("list_items")
    .select("id, owner_id")
    .eq("id", listItemId)
    .maybeSingle();

  if (itemError || !item) return { error: "That item doesn't exist." };
  if (item.owner_id === user.id) return { error: "It's already yours." };

  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rateLimitResult = await checkRateLimit("connectionsPerHour", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "That's a lot of connection requests in one hour — try again later." };
  }

  // Plain insert + ignore the duplicate-key error, not upsert — `interests`
  // has no UPDATE policy in db/migrations/0001_rls.sql (there's nothing on
  // it worth ever updating, the pair itself IS the whole row), so an
  // upsert's on-conflict-do-update path would be rejected by RLS. A repeat
  // "I'm in" click is just a no-op.
  const { error: interestError } = await supabase
    .from("interests")
    .insert({ list_item_id: listItemId, user_id: user.id });
  if (interestError && interestError.code !== "23505") {
    return { error: "Couldn't send that." };
  }

  // connections DOES have an update policy (connections_update_involved),
  // so upsert is safe here. On conflict (re-expressing interest after a
  // prior revoke), owner_accepted is reset to false along with the revoke
  // fields — a revoked connection must go through mutual consent again
  // from scratch, not silently spring back to "connected" just because the
  // interested side re-clicked. Skipping that reset would let someone who
  // was revoked regain access without the owner ever re-agreeing.
  const { error } = await supabase.from("connections").upsert(
    {
      list_item_id: listItemId,
      owner_id: item.owner_id,
      interested_id: user.id,
      interested_accepted: true,
      owner_accepted: false,
      revoked_at: null,
      revoked_by: null,
    },
    { onConflict: "list_item_id,interested_id" }
  );

  if (error) return { error: "Couldn't send that." };

  revalidatePath("/feed");
  revalidatePath("/connections");
  return { ok: true };
}

async function requireConnectionAs(
  connectionId: string,
  side: "owner_id" | "interested_id"
): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: connection } = await supabase
    .from("connections")
    .select("id")
    .eq("id", connectionId)
    .eq(side, user.id)
    .maybeSingle();

  if (!connection) return { error: "Not found." };
  return { userId: user.id };
}

export async function acceptConnection(connectionId: string): Promise<{ error?: string }> {
  const check = await requireConnectionAs(connectionId, "owner_id");
  if ("error" in check) return check;

  const supabase = await createClient();
  const { error } = await supabase
    .from("connections")
    .update({ owner_accepted: true })
    .eq("id", connectionId);

  if (error) return { error: "Couldn't accept that." };
  revalidatePath("/connections");
  return {};
}

export async function declineConnection(connectionId: string): Promise<{ error?: string }> {
  const check = await requireConnectionAs(connectionId, "owner_id");
  if ("error" in check) return check;

  const supabase = await createClient();
  const { error } = await supabase.from("connections").delete().eq("id", connectionId);

  if (error) return { error: "Couldn't decline that." };
  revalidatePath("/connections");
  return {};
}

// Either side can revoke at any time (BUILD-PROMPT.md §5's "revocable by
// either side"). Kept as a row with revoked_at set, not a delete — an
// active connection someone chose to end is still worth a record existing
// for, unlike a plain decline of a request that never became mutual.
export async function revokeConnection(connectionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: connection } = await supabase
    .from("connections")
    .select("id")
    .eq("id", connectionId)
    .or(`owner_id.eq.${user.id},interested_id.eq.${user.id}`)
    .maybeSingle();

  if (!connection) return { error: "Not found." };

  const { error } = await supabase
    .from("connections")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq("id", connectionId);

  if (error) return { error: "Couldn't revoke that." };
  revalidatePath("/connections");
  return {};
}
