import Link from "next/link";

type ExploreHref = { pathname: "/explore"; query: Record<string, string> };

/*
 * The catalog carries four dimensions beyond category — difficulty, group
 * size, locale, spice — seeded on every row and selected in every query,
 * but never rendered or filterable anywhere in the UI (AUDIT-2026-08.md
 * §1.2 finding C). This is the passport-register treatment: a labelled
 * strip of plain mono links, like conditions printed on a visa page — not
 * a chip, not a pill, no colour fill. Difficulty and spice use roman
 * numerals rather than arabic digits specifically so they read as a mark
 * printed on the page, not as a numeric badge/counter.
 */

const GROUP_SIZE_OPTIONS = [
  { key: "any", label: "Any" },
  { key: "solo", label: "Solo" },
  { key: "duo", label: "Duo" },
  { key: "group", label: "Group" },
] as const;

const LOCALE_OPTIONS = [
  { key: "any", label: "Any" },
  { key: "campus", label: "Campus" },
  { key: "ncr", label: "Off campus" },
  { key: "anywhere", label: "Anywhere" },
] as const;

const LEVEL_OPTIONS = [
  { key: "any", label: "Any" },
  { key: "1", label: "I" },
  { key: "2", label: "II" },
  { key: "3", label: "III" },
] as const;

function FilterRow({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  active: string;
  hrefFor: (key: string) => ExploreHref;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-s-minus-2 uppercase tracking-wide">
      <span className="text-ink-faint w-16 flex-none">{label}</span>
      <div className="flex flex-wrap gap-x-2.5">
        {options.map((opt, i) => {
          const isActive = opt.key === active;
          return (
            <span key={opt.key} className="flex items-baseline gap-2.5">
              {i > 0 && <span className="text-rule" aria-hidden="true">·</span>}
              <Link
                href={hrefFor(opt.key)}
                aria-current={isActive ? "true" : undefined}
                className={isActive ? "text-ink border-b border-ink" : "text-ink-faint hover:text-ink-mid"}
              >
                {opt.label}
              </Link>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function DimensionFilters({
  groupSize,
  locale,
  difficulty,
  spice,
  hrefFor,
}: {
  groupSize: string;
  locale: string;
  difficulty: string;
  spice: string;
  hrefFor: (dimension: "groupSize" | "locale" | "difficulty" | "spice", key: string) => ExploreHref;
}) {
  return (
    <div className="flex flex-col gap-1.5 mb-6 pb-5 border-b border-rule-fine" role="group" aria-label="Filter by group size, place, effort, and edge">
      <FilterRow label="Who" options={GROUP_SIZE_OPTIONS} active={groupSize} hrefFor={(k) => hrefFor("groupSize", k)} />
      <FilterRow label="Where" options={LOCALE_OPTIONS} active={locale} hrefFor={(k) => hrefFor("locale", k)} />
      <FilterRow label="Effort" options={LEVEL_OPTIONS} active={difficulty} hrefFor={(k) => hrefFor("difficulty", k)} />
      <FilterRow label="Edge" options={LEVEL_OPTIONS} active={spice} hrefFor={(k) => hrefFor("spice", k)} />
    </div>
  );
}
