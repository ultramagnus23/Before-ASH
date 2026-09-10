"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { splitEvenly, parseRupees } from "@/lib/money/split";

/*
 * Writing to the ledger.
 *
 * The split is computed here, in TypeScript, and sent to the database as
 * explicit per-person shares — the SQL function then re-checks that they sum
 * to the exact amount and that every share belongs to a member, and refuses
 * the whole transaction otherwise. Two independent checks of the same
 * invariant, because this is money: the client can be wrong, and the server
 * must not take its word for it.
 */

const ExpenseSchema = z.object({
  groupId: z.string().uuid(),
  description: z.string().trim().min(1).max(120),
  // Arrives as typed text ("120.50"), never as a number — a float would
  // already have lost precision by the time it reached this line.
  amount: z.string().min(1),
  payerId: z.string().uuid(),
  sharedWith: z.array(z.string().uuid()).min(1),
});

export async function recordExpense(input: unknown): Promise<{ error?: string }> {
  const parsed = ExpenseSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the details and try again." };
  const { groupId, description, amount, payerId, sharedWith } = parsed.data;

  const amountPaise = parseRupees(amount);
  if (amountPaise === null) return { error: "That amount isn't a number of rupees." };
  if (amountPaise === 0) return { error: "An expense needs an amount." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // The rotation is allocated inside the SQL function under a row lock, so
  // it cannot be read here first without a race. What is passed is the
  // split for the rotation the function will assign — which is why the
  // function recomputes nothing and simply verifies the total.
  const { data: existing } = await supabase
    .from("outing_expenses")
    .select("rotation")
    .eq("group_id", groupId)
    .order("rotation", { ascending: false })
    .limit(1);
  const rotation = ((existing?.[0]?.rotation as number | undefined) ?? -1) + 1;

  const shares = splitEvenly(amountPaise, sharedWith, rotation);

  const { error } = await supabase.rpc("record_outing_expense", {
    p_group_id: groupId,
    p_payer_id: payerId,
    p_amount_paise: amountPaise,
    p_description: description,
    p_shares: shares,
  });
  if (error) {
    // The function raises 42501 for "not a member" and a plain exception
    // for a shares/amount mismatch. Neither is worth echoing verbatim.
    return { error: error.code === "42501" ? "You're not in this group." : "Couldn't save that." };
  }

  revalidatePath(`/outings/${groupId}`);
  return {};
}

const SettlementSchema = z.object({
  groupId: z.string().uuid(),
  toId: z.string().uuid(),
  amount: z.string().min(1),
});

/** Record that YOU paid someone. They confirm it separately. */
export async function recordSettlement(input: unknown): Promise<{ error?: string }> {
  const parsed = SettlementSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the details and try again." };

  const amountPaise = parseRupees(parsed.data.amount);
  if (amountPaise === null || amountPaise <= 0) return { error: "That amount isn't a number of rupees." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // from_id is pinned to the caller by the RLS insert policy, so this
  // cannot be used to assert that someone else paid.
  const { error } = await supabase.from("outing_settlements").insert({
    group_id: parsed.data.groupId,
    from_id: user.id,
    to_id: parsed.data.toId,
    amount_paise: amountPaise,
  });
  if (error) return { error: "Couldn't record that." };

  revalidatePath(`/outings/${parsed.data.groupId}`);
  return {};
}

/**
 * Confirm you received a payment.
 *
 * The RLS update policy allows this only for the recipient and only on an
 * unconfirmed row, so there is no ownership check written here — the
 * database refuses the update rather than this function declining it.
 */
export async function confirmSettlement(settlementId: string, groupId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("outing_settlements")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", settlementId)
    .is("confirmed_at", null)
    .select("id");
  if (error) return { error: "Couldn't confirm that." };
  if ((data ?? []).length === 0) return { error: "That isn't yours to confirm." };

  revalidatePath(`/outings/${groupId}`);
  return {};
}
