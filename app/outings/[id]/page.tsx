import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupLedger } from "@/lib/queries/split";
import { getOutingHeader } from "@/lib/queries/outings";
import { formatPaise } from "@/lib/money/split";
import { ExpenseForm } from "./expense-form";
import { SettleUp } from "./settle-up";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

/*
 * One outing: who's in it, what's been spent, and who owes whom.
 *
 * Balances are computed from the ledger on every render rather than stored.
 * A stored balance is a second source of truth that can drift from the
 * entries that produced it, and the entries are append-only precisely so
 * that recomputing is always correct.
 */
export default async function OutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [header, ledger] = await Promise.all([getOutingHeader(id), getGroupLedger(id, user.id)]);
  // RLS returns nothing for a non-member, so "not a member" and "does not
  // exist" are the same 404 — which is the right answer to both.
  if (!header || !ledger) notFound();

  const you = ledger.balances.find((b) => b.userId === user.id);
  const others = ledger.balances.filter((b) => b.userId !== user.id);

  return (
    <>
      <AppNav active="/outings" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>
              <Link href="/outings" className="hover:text-ink">
                Outings
              </Link>
            </span>
          </div>

          <h1 className="font-display font-extrabold text-s-2 leading-[1.08] tracking-[-0.02em] mt-6 mb-1">
            <Link href={`/q/${header.questSlug}` as Route} className="hover:opacity-80">
              {header.questTitle}
            </Link>
          </h1>
          <p className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide mb-8">
            {ledger.members.map((m) => m.handle).join(" · ")}
          </p>

          {/* ── where you stand ─────────────────────────────────────── */}
          <h2 className="font-display font-medium text-s-1 mb-3">Where it stands</h2>
          {ledger.expenses.length === 0 ? (
            <p className="text-ink-mid mb-8">Nothing spent yet.</p>
          ) : (
            <ul className="list-none mb-8">
              {[you, ...others].filter(Boolean).map((balance) => {
                const b = balance!;
                const isYou = b.userId === user.id;
                return (
                  <li key={b.userId} className="flex items-baseline justify-between py-1.5 border-b border-rule-fine">
                    <span className={isYou ? "font-medium" : "text-ink-mid"}>
                      {isYou ? "You" : b.handle}
                    </span>
                    <span className="font-mono text-s-minus-1">
                      {b.netPaise === 0 ? (
                        <span className="text-ink-faint">settled</span>
                      ) : b.netPaise > 0 ? (
                        <span>is owed {formatPaise(b.netPaise)}</span>
                      ) : (
                        <span>owes {formatPaise(-b.netPaise)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── settlements waiting on you ──────────────────────────── */}
          {ledger.awaitingYourConfirmation.length > 0 && (
            <div className="mb-8 border border-ink px-4 py-3">
              <h2 className="font-display font-medium text-s-1 mb-2">Did you get this?</h2>
              <ul className="list-none">
                {ledger.awaitingYourConfirmation.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 py-1.5">
                    <span className="text-ink-mid">
                      {s.fromHandle} says they paid you {formatPaise(s.amountPaise)}
                    </span>
                    <SettleUp mode="confirm" groupId={id} settlementId={s.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── add an expense ──────────────────────────────────────── */}
          <h2 className="font-display font-medium text-s-1 mb-3">Add something</h2>
          <ExpenseForm
            groupId={id}
            members={ledger.members}
            viewerId={user.id}
          />

          {/* ── settle up ───────────────────────────────────────────── */}
          {others.length > 0 && (
            <>
              <h2 className="font-display font-medium text-s-1 mt-8 mb-3">Paid someone back?</h2>
              <SettleUp mode="record" groupId={id} members={others} />
            </>
          )}

          {/* ── the ledger ──────────────────────────────────────────── */}
          {ledger.expenses.length > 0 && (
            <>
              <h2 className="font-display font-medium text-s-1 mt-10 mb-1">Everything so far</h2>
              <p className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide mb-3">
                nothing here can be edited or deleted — fix a mistake by adding
                the opposite
              </p>
              <ul className="list-none">
                {ledger.expenses.map((expense) => (
                  <li key={expense.id} className="py-2 border-b border-rule-fine">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>{expense.description}</span>
                      <span className="font-mono text-s-minus-1 flex-none">
                        {formatPaise(expense.amountPaise)}
                      </span>
                    </div>
                    <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-0.5">
                      {expense.payerId === user.id ? "you paid" : `${expense.payerHandle} paid`}
                      {expense.yourShare !== 0 && ` · your share ${formatPaise(expense.yourShare)}`}
                      {" · "}
                      {new Date(expense.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </li>
                ))}
                {ledger.settlements.map((s) => (
                  <li key={s.id} className="py-2 border-b border-rule-fine text-ink-mid">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>
                        {s.fromId === user.id ? "You" : s.fromHandle} paid{" "}
                        {s.toId === user.id ? "you" : s.toHandle} back
                      </span>
                      <span className="font-mono text-s-minus-1 flex-none">{formatPaise(s.amountPaise)}</span>
                    </div>
                    <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-0.5">
                      {s.confirmed ? "confirmed" : "waiting on confirmation — not counted yet"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </PlateTilt>
      </main>
    </>
  );
}
