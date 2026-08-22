// Four stamp inks, assigned by category group, appearing ONLY on
// completion — this mapping is the single source of truth referenced from
// app/globals.css's comment. Grouped by feel rather than any formal
// taxonomy: institutional/chaotic, effortful/ambitious, interpersonal, and
// bodily/logistical.
export type StampInk = "vermilion" | "teal" | "violet" | "ochre";

const CATEGORY_INK: Record<string, StampInk> = {
  campus_ritual: "vermilion",
  chaos: "vermilion",
  admin_life: "vermilion",
  legacy: "vermilion",

  academic: "teal",
  career_money: "teal",
  creative: "teal",
  skills: "teal",

  people: "violet",
  night: "violet",
  solitude: "violet",

  food: "ochre",
  body_sport: "ochre",
  delhi_ncr: "ochre",
  service: "ochre",
};

export function inkForCategory(category: string): StampInk {
  return CATEGORY_INK[category] ?? "teal";
}

// Deterministic per-item rotation, seeded from the item's own id so the
// same item always tilts the same way (a re-render or a page reload never
// jitters it) but different items scatter naturally, like real ink stamps
// never landing perfectly straight. Range matches the reference prototype:
// roughly -11deg to +8deg.
export function seedRotationDeg(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 20) - 11;
}

// Short display code for the stamp badge's second line. Catalog items show
// their real id (e.g. "CP-1002"); custom items have no catalog id, so we
// derive a short one from the list_item's own uuid instead of showing the
// full uuid, which would be visually loud and meaningless to the user.
export function stampCode(params: { questId: string | null; listItemId: string }): string {
  if (params.questId) return params.questId;
  return `CU-${params.listItemId.slice(0, 6).toUpperCase()}`;
}

export function formatStampDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
    .toUpperCase();
}
