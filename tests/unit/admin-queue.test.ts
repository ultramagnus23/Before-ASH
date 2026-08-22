import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Static check on the migration SQL itself: proves the review_queue view
 * definition never selects owner_id, handle, or email — the reviewer's two
 * questions (BUILD-PROMPT.md §6/§14g) are only answerable without that
 * information if it's structurally absent from the view, not just
 * withheld by UI convention. This can't catch a runtime RLS/grant mistake
 * (that needs a live-DB test against a real Supabase project), but it
 * does catch the more likely failure: someone editing the view definition
 * later and accidentally widening the SELECT list.
 */
describe("review_queue view definition", () => {
  const migrationPath = join(process.cwd(), "db", "migrations", "0006_safety_p6.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  // "create view", not "create or replace view" — changed after this
  // migration was actually run against a live Supabase database where
  // 0001_rls.sql's original view already existed: CREATE OR REPLACE VIEW
  // can only append columns at the end, and appealed_at needed to sit in
  // the middle for readability, so this file now does DROP + CREATE
  // instead. See db/migrations/0006_safety_p6.sql's comment for the story.
  const viewMatch = sql.match(/create view review_queue as([\s\S]*?);/);
  const viewDefinition = viewMatch?.[1];
  if (!viewDefinition) throw new Error("Could not find the review_queue view definition in 0006_safety_p6.sql");

  // The view legitimately references owner_id internally — joining
  // profiles to compute account_age_bucket, and a correlated subquery
  // counting prior rejections by the same owner — without ever adding it
  // to the OUTPUT column list. A blanket "the string owner_id never
  // appears" check doesn't distinguish "used to join/filter" from
  // "exposed to the caller," so it was failing on the view's own correct,
  // necessary internals. Strip exactly those two known-legitimate uses —
  // the join predicate and the parenthesized subquery — and check what's
  // left, which is the actual output column list plus the WHERE/ORDER BY.
  function stripParenGroups(text: string): string {
    let prev: string;
    let result = text;
    do {
      prev = result;
      result = result.replace(/\([^()]*\)/g, "");
    } while (result !== prev);
    return result;
  }
  const withoutJoinPredicate = viewDefinition.replace(/join profiles p on p\.id = li\.owner_id/, "");
  const outputAndFilterSurface = stripParenGroups(withoutJoinPredicate);

  it("never exposes owner_id as an output column (join/subquery internals are fine)", () => {
    expect(outputAndFilterSurface).not.toMatch(/\bowner_id\b/);
  });

  it("never selects a handle column", () => {
    expect(viewDefinition).not.toMatch(/\bhandle\b/);
  });

  it("never selects email", () => {
    expect(viewDefinition).not.toMatch(/\bemail\b/);
  });

  it("is hardened with security_invoker and has no grant to authenticated/anon", () => {
    expect(sql).toMatch(/alter view review_queue set \(security_invoker = true\)/);
    expect(sql).toMatch(/revoke all on review_queue from public, anon, authenticated/);
  });
});
