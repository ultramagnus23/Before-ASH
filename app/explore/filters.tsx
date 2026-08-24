import Link from "next/link";

type ExploreHref = { pathname: "/explore"; query: Record<string, string> };

// Plain links with query params, not client-side state — filtering is a
// navigation, so it works with JS disabled and needs no client bundle.
export function CategoryFilters({
  categories,
  active,
  hrefFor,
}: {
  categories: { key: string; label: string }[];
  active: string;
  // Built once in the page component from the full current filter set, so
  // switching category doesn't silently drop the group-size/locale/
  // difficulty/spice filters set in DimensionFilters — every filter link
  // on the page changes exactly one dimension and carries the rest.
  hrefFor: (category: string) => ExploreHref;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Filter by category">
      {categories.map((c) => {
        const href = hrefFor(c.key);
        const isActive = c.key === active;
        return (
          <Link
            key={c.key}
            href={href}
            // aria-current, not aria-pressed — aria-pressed is a toggle-button
            // semantic and is invalid on an <a>/Link. This is a navigation
            // (query-param) link, so "current selection within this set" is
            // aria-current="true", matching AppNav's aria-current="page" for
            // the same reason.
            aria-current={isActive ? "true" : undefined}
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
