import "server-only";
import { createClient } from "@/lib/supabase/server";
import { balances, type LedgerEntry, type Paise } from "@/lib/money/split";

export type GroupMember = { userId: string; handle: string };

export type ExpenseRow = {
  id: string;
  description: string;
  amountPaise: Paise;
  payerId: string;
  payerHandle: string;
  createdAt: string;
  yourShare: Paise;
};

export type SettlementRow = {
  id: string;
  fromId: string;
  toId: string;
  fromHandle: string;
  toHandle: string;
  amountPaise: Paise;
  confirmed: boolean;
  createdAt: string;
};

export type GroupLedger = {
  members: GroupMember[];
  expenses: ExpenseRow[];
  settlements: SettlementRow[];
  /** Net position per member. Positive means the group owes them. */
  balances: { userId: string; handle: string; netPaise: Paise }[];
  /** Settlements addressed to the viewer that are waiting on their confirmation. */
  awaitingYourConfirmation: SettlementRow[];
};

type MemberRow = { user_id: string; profiles: { handle: string } | { handle: string }[] | null };

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * The whole ledger for one outing group.
 *
 * Every read here goes through RLS, which restricts all three tables to
 * members of the group — no group filter is written by hand, so there is
 * exactly one place this can go wrong rather than three.
 */
export async function getGroupLedger(groupId: string, viewerId: string): Promise<GroupLedger | null> {
  const supabase = await createClient();

  const { data: memberRows, error: memberError } = await supabase
    .from("outing_group_members")
    .select("user_id, profiles(handle)")
    .eq("group_id", groupId);
  if (memberError) throw memberError;

  const members: GroupMember[] = ((memberRows ?? []) as unknown as MemberRow[]).map((row) => ({
    userId: row.user_id,
    handle: one(row.profiles)?.handle ?? "someone",
  }));

  // RLS returned nothing, which for a member is impossible — so the viewer
  // is not in this group, and it should read as absent rather than empty.
  if (members.length === 0) return null;

  const handleOf = new Map(members.map((m) => [m.userId, m.handle]));

  const [{ data: expenseRows }, { data: shareRows }, { data: settlementRows }] = await Promise.all([
    supabase
      .from("outing_expenses")
      .select("id, description, amount_paise, payer_id, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
    supabase.from("outing_expense_shares").select("expense_id, user_id, share_paise"),
    supabase
      .from("outing_settlements")
      .select("id, from_id, to_id, amount_paise, confirmed_at, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
  ]);

  const sharesByExpense = new Map<string, { userId: string; sharePaise: number }[]>();
  for (const row of shareRows ?? []) {
    const list = sharesByExpense.get(row.expense_id as string) ?? [];
    list.push({ userId: row.user_id as string, sharePaise: Number(row.share_paise) });
    sharesByExpense.set(row.expense_id as string, list);
  }

  const expenses: ExpenseRow[] = (expenseRows ?? []).map((row) => {
    const shares = sharesByExpense.get(row.id as string) ?? [];
    return {
      id: row.id as string,
      description: row.description as string,
      amountPaise: Number(row.amount_paise),
      payerId: row.payer_id as string,
      payerHandle: handleOf.get(row.payer_id as string) ?? "someone",
      createdAt: row.created_at as string,
      yourShare: shares.find((s) => s.userId === viewerId)?.sharePaise ?? 0,
    };
  });

  const settlements: SettlementRow[] = (settlementRows ?? []).map((row) => ({
    id: row.id as string,
    fromId: row.from_id as string,
    toId: row.to_id as string,
    fromHandle: handleOf.get(row.from_id as string) ?? "someone",
    toHandle: handleOf.get(row.to_id as string) ?? "someone",
    amountPaise: Number(row.amount_paise),
    confirmed: row.confirmed_at !== null,
    createdAt: row.created_at as string,
  }));

  // Only CONFIRMED settlements move a balance. An unconfirmed one is a
  // claim, not a transfer — counting it would let one person clear a debt
  // by asserting they paid it, which is the exact failure two-sided
  // settle-up exists to prevent.
  const entries: LedgerEntry[] = [
    ...expenses.map((expense) => ({
      kind: "expense" as const,
      payerId: expense.payerId,
      amountPaise: expense.amountPaise,
      shares: sharesByExpense.get(expense.id) ?? [],
    })),
    ...settlements
      .filter((s) => s.confirmed)
      .map((s) => ({
        kind: "settlement" as const,
        fromId: s.fromId,
        toId: s.toId,
        amountPaise: s.amountPaise,
      })),
  ];

  const net = balances(entries);

  return {
    members,
    expenses,
    settlements,
    balances: members.map((member) => ({
      userId: member.userId,
      handle: member.handle,
      netPaise: net.get(member.userId) ?? 0,
    })),
    awaitingYourConfirmation: settlements.filter((s) => !s.confirmed && s.toId === viewerId),
  };
}
