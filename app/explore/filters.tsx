import Link from "next/link";

// Plain links with query params, not client-side state — filtering is a
// navigation, so it works with JS disabled and needs no client bundle.
export function CategoryFilters({
  categories,
  active,
  query,
}: {
  categories: { key: string; label: string }[];
  active: string;
  query: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Filter by category">
      {categories.map((c) => {
        // A UrlObject, not a hand-built string — typedRoutes (only actually
        // taking effect now that next.config.ts's key moved out of the
        // deprecated `experimental` block) can verify /explore statically
        // this way, and Next handles the query-string encoding itself
        // instead of a manual encodeURIComponent.
        const href = { pathname: "/explore" as const, query: { category: c.key, ...(query ? { q: query } : {}) } };
        const isActive = c.key === active;
        return (
          <Link
            key={c.key}
            href={href}
            aria-pressed={isActive}
            className={`font-mono text-s-minus-1 uppercase tracking-wide px-0.5 py-1 border-b ${
              isActive ? "text-ink border-ink" : "text-ink-faint border-transparent"
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
