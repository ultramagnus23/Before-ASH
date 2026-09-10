/*
 * Money, in integer paise. Never a float, anywhere, for any reason.
 *
 * 0.1 + 0.2 !== 0.3 is the whole argument: a rupee-denominated float drifts,
 * and a drifting balance between friends is the one bug in this feature
 * nobody would report politely. Every amount in this module, in the database,
 * and in every function that touches either is a whole number of paise.
 * Formatting to rupees happens once, at the edge, in `formatPaise`.
 */

export type Paise = number;

export type Split = { userId: string; sharePaise: Paise };

/**
 * Divide an amount among members so the parts sum EXACTLY to the whole.
 *
 * 100 paise between 3 people is 33.33 each, which does not exist. Someone
 * pays the extra paise. Rounding each share independently either loses money
 * or invents it, so the remainder is handed out whole, one paisa at a time.
 *
 * Who gets it rotates. `rotation` is the group's expense sequence number, so
 * across a term of chai runs the extra paise land on everyone in turn rather
 * than always on whoever sorts first alphabetically. It is deterministic --
 * the same expense always splits the same way, which is what makes the
 * ledger reproducible and the append-only rule meaningful.
 */
export function splitEvenly(amountPaise: Paise, memberIds: string[], rotation: number): Split[] {
  if (!Number.isInteger(amountPaise)) {
    throw new Error(`Amount must be whole paise, got ${amountPaise}.`);
  }
  if (memberIds.length === 0) throw new Error("Cannot split between nobody.");

  // Sorted so the split depends on WHO is in the group, not on the order the
  // database happened to return them in.
  const members = [...memberIds].sort();
  const n = members.length;

  // Truncation toward zero, so a negative amount (a refund, entered as a
  // reversing entry) distributes the same way in the opposite direction.
  const base = Math.trunc(amountPaise / n);
  let remainder = amountPaise - base * n;
  const step = remainder >= 0 ? 1 : -1;
  const offset = ((rotation % n) + n) % n;

  const shares = members.map((userId) => ({ userId, sharePaise: base }));
  for (let i = 0; remainder !== 0; i++) {
    shares[(offset + i) % n]!.sharePaise += step;
    remainder -= step;
  }
  return shares;
}

export type LedgerEntry =
  | { kind: "expense"; payerId: string; amountPaise: Paise; shares: Split[] }
  | { kind: "settlement"; fromId: string; toId: string; amountPaise: Paise };

/**
 * Net position per person: positive means the group owes them.
 *
 * Balances always sum to exactly zero. That is not an aspiration -- it is
 * the invariant the property test in tests/unit/split.test.ts checks against
 * random ledgers, and it is what makes "who owes what" answerable at all.
 */
export function balances(entries: LedgerEntry[]): Map<string, Paise> {
  const net = new Map<string, Paise>();
  const add = (id: string, amount: Paise) => net.set(id, (net.get(id) ?? 0) + amount);

  for (const entry of entries) {
    if (entry.kind === "expense") {
      add(entry.payerId, entry.amountPaise);
      for (const share of entry.shares) add(share.userId, -share.sharePaise);
    } else {
      // A settlement moves real money, so it cancels the debt in both
      // directions at once: the payer is owed less, the payee owes less.
      add(entry.fromId, entry.amountPaise);
      add(entry.toId, -entry.amountPaise);
    }
  }
  return net;
}

/** Display only. The one place paise become rupees, and it never rounds. */
export function formatPaise(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}₹${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse "120", "120.50", "₹120.5" into paise. Rejects anything finer. */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return negative ? -paise : paise;
}
