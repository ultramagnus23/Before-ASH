// Supabase's select-string type inference can't see foreign-key
// cardinality without generated schema types, so a to-one embed like
// `quest:quests(title)` still infers as an array (`{title}[]`). At runtime
// it's always a single row or null. Every `lib/queries/*` and
// `lib/*/actions.ts` file that embeds a to-one relation hits this same
// mismatch — this is the one place that normalizes it.
export function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}
