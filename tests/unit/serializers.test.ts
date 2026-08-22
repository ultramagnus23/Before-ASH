import { describe, it, expect } from "vitest";
import { toPublicListItem, PUBLIC_COLUMNS_FOR_TEST } from "@/lib/queries/list-items";

/*
 * Proves BUILD-PROMPT.md #2: list_items.note never appears in any public
 * serializer. Two independent checks: the actual Supabase column-select
 * string never mentions "note", and the mapping function drops it even if
 * a future refactor accidentally over-selects it from the database.
 */
describe("toPublicListItem", () => {
  const ownerId = "33333333-3333-3333-3333-333333333333";
  const viewerId = "44444444-4444-4444-4444-444444444444";

  it("never includes `note` even if the raw row carries it", () => {
    const rowWithLeakedNote = {
      id: "11111111-1111-1111-1111-111111111111",
      category: "food",
      custom_title: "Eat the whole mess menu",
      proof: "Did it, regret nothing",
      completed_at: "2026-08-01T00:00:00Z",
      visibility: "public" as const,
      owner_id: ownerId,
      note: "this is a private journal note that must never leak",
    };

    const result = toPublicListItem(rowWithLeakedNote, viewerId);

    expect(result).not.toHaveProperty("note");
    expect(JSON.stringify(result)).not.toContain("private journal note");
  });

  it("strips owner handle for anonymous items", () => {
    const row = {
      id: "22222222-2222-2222-2222-222222222222",
      category: "people",
      custom_title: "Sit with strangers in the mess",
      proof: null,
      completed_at: "2026-08-01T00:00:00Z",
      visibility: "anonymous" as const,
      owner_id: ownerId,
      owner: { handle: "should_never_appear" },
    };

    const result = toPublicListItem(row, viewerId);

    expect(result.ownerHandle).toBeNull();
    expect(JSON.stringify(result)).not.toContain("should_never_appear");
  });

  it("marks isOwnItem true only when the viewer is the owner, and never leaks owner_id itself", () => {
    const row = {
      id: "55555555-5555-5555-5555-555555555555",
      category: "solitude",
      custom_title: "Sit somewhere alone",
      proof: null,
      completed_at: "2026-08-01T00:00:00Z",
      visibility: "anonymous" as const,
      owner_id: ownerId,
    };

    const asOwner = toPublicListItem(row, ownerId);
    const asStranger = toPublicListItem(row, viewerId);
    const asAnonymousViewer = toPublicListItem(row, null);

    expect(asOwner.isOwnItem).toBe(true);
    expect(asStranger.isOwnItem).toBe(false);
    expect(asAnonymousViewer.isOwnItem).toBe(false);
    expect(JSON.stringify(asOwner)).not.toContain(ownerId);
  });

  it("keeps the public column selection free of `note`", () => {
    expect(PUBLIC_COLUMNS_FOR_TEST).not.toMatch(/\bnote\b/);
  });
});
