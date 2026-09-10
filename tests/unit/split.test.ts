import { describe, it, expect } from "vitest";
import { splitEvenly, balances, formatPaise, parseRupees, type LedgerEntry } from "@/lib/money/split";

/*
 * The property test comes first, because the invariant is the feature: if
 * balances do not sum to zero, the ledger has invented or destroyed money and
 * every number the UI shows is a lie. Everything else here is a special case
 * of that.
 */

function randomLedger(seed: number): { entries: LedgerEntry[]; members: string[] } {
  // A tiny LCG so a failure is reproducible from its seed rather than
  // vanishing on the next run.
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;

  const members = Array.from({ length: 2 + Math.floor(rand() * 10) }, (_, i) => `u${i}`);
  const entries: LedgerEntry[] = [];

  for (let i = 0; i < 40; i++) {
    if (rand() < 0.75) {
      const amount = Math.floor(rand() * 500_00) - 100_00; // includes refunds
      const payer = members[Math.floor(rand() * members.length)]!;
      // Some expenses involve only part of the group.
      const involved = members.filter(() => rand() < 0.8);
      const shares = splitEvenly(amount, involved.length > 0 ? involved : members, i);
      entries.push({ kind: "expense", payerId: payer, amountPaise: amount, shares });
    } else {
      const from = members[Math.floor(rand() * members.length)]!;
      const to = members[Math.floor(rand() * members.length)]!;
      entries.push({ kind: "settlement", fromId: from, toId: to, amountPaise: Math.floor(rand() * 200_00) });
    }
  }
  return { entries, members };
}

describe("balances (property)", () => {
  it("always sum to exactly zero, across 500 random ledgers", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const { entries } = randomLedger(seed);
      const total = [...balances(entries).values()].reduce((a, b) => a + b, 0);
      expect(total, `seed ${seed}`).toBe(0);
    }
  });

  it("only ever produces whole paise", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const value of balances(randomLedger(seed).entries).values()) {
        expect(Number.isInteger(value), `seed ${seed}`).toBe(true);
      }
    }
  });
});

describe("splitEvenly", () => {
  it("sums to the exact total even when it does not divide", () => {
    const shares = splitEvenly(100, ["a", "b", "c"], 0);
    expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(100);
    expect(shares.map((s) => s.sharePaise).sort((a, b) => a - b)).toEqual([33, 33, 34]);
  });

  it("rotates who absorbs the extra paisa", () => {
    // Over three chai runs, each of the three pays the odd paisa once --
    // this is the whole reason rotation exists rather than always charging
    // whoever sorts first.
    const absorbed = [0, 1, 2].map(
      (rotation) => splitEvenly(100, ["a", "b", "c"], rotation).find((s) => s.sharePaise === 34)!.userId
    );
    expect(new Set(absorbed).size).toBe(3);
  });

  it("does not depend on the order members arrive in", () => {
    const forward = splitEvenly(100, ["a", "b", "c"], 1);
    const backward = splitEvenly(100, ["c", "b", "a"], 1);
    expect(backward).toEqual(forward);
  });

  it("is stable for the same expense", () => {
    expect(splitEvenly(1_00_01, ["a", "b", "c"], 7)).toEqual(splitEvenly(1_00_01, ["a", "b", "c"], 7));
  });

  it("handles a refund by distributing the remainder the other way", () => {
    const shares = splitEvenly(-100, ["a", "b", "c"], 0);
    expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(-100);
    expect(shares.map((s) => s.sharePaise).sort((a, b) => a - b)).toEqual([-34, -33, -33]);
  });

  it("gives one person the whole amount", () => {
    expect(splitEvenly(999, ["a"], 3)).toEqual([{ userId: "a", sharePaise: 999 }]);
  });

  it("refuses a fractional amount rather than rounding it", () => {
    expect(() => splitEvenly(10.5, ["a", "b"], 0)).toThrow(/whole paise/);
  });

  it("refuses to split between nobody", () => {
    expect(() => splitEvenly(100, [], 0)).toThrow();
  });
});

describe("formatPaise", () => {
  it("never loses the second decimal place", () => {
    expect(formatPaise(1_00_05)).toBe("₹100.05");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(50)).toBe("₹0.50");
  });

  it("keeps the sign outside the symbol", () => {
    expect(formatPaise(-1250)).toBe("-₹12.50");
  });

  it("round-trips through parseRupees", () => {
    for (const paise of [0, 1, 99, 100, 12345, 99_999_99]) {
      expect(parseRupees(formatPaise(paise))).toBe(paise);
    }
  });
});

describe("parseRupees", () => {
  it("accepts the shapes people actually type", () => {
    expect(parseRupees("120")).toBe(12000);
    expect(parseRupees("120.5")).toBe(12050);
    expect(parseRupees("₹1,200.50")).toBe(120050);
  });

  it("rejects anything finer than a paisa rather than rounding it", () => {
    expect(parseRupees("120.567")).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseRupees("")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(parseRupees("1e5")).toBeNull();
  });
});
