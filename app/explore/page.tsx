import Link from "next/link";
import { redirect } from "next/navigation";
import { searchQuests, getCategories, getRandomQuestSlug, type ExploreFilters } from "@/lib/queries/explore";
import { CategoryFilters } from "./filters";
import { DimensionFilters } from "./dimension-filters";
import { AddButton } from "./add-button";
import { SearchBox } from "./search-box";
import { RemixButton } from "./remix-button";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

type ExploreHref = { pathname: "/explore"; query: Record<string, string> };

const LEVEL_MARK: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

const ORDER_NOTE: Record<string, string> = {
  "relevance-semantic": "Closest in meaning, not in words.",
  "relevance-wording": "Matched by wording.",
  ranked: "Ordered by what's live right now, not by id.",
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    groupSize?: string;
    locale?: string;
    difficulty?: string;
    spice?: string;
    surprise?: string;
  }>;
}) {
  const params = await searchParams;
  const filters: ExploreFilters = {
    query: params.q ?? "",
    category: params.category ?? "all",
    groupSize: params.groupSize ?? "any",
    locale: params.locale ?? "any",
    difficulty: params.difficulty ?? "any",
    spice: params.spice ?? "any",
    page: Math.max(1, Number(params.page) || 1),
  };

  // "Deal me something" — a random pick within the current filters, then
  // straight to its page. A search query doesn't compose with this (it's a
  // browse affordance, not a search one), so it's dropped for the pick.
  if (params.surprise) {
    const slug = await getRandomQuestSlug({ ...filters, query: undefined });
    if (slug) redirect(`/q/${slug}`);
  }

  const [result, categories] = await Promise.all([searchQuests(filters), getCategories()]);
  const { quests, total, pageSize, orderedBy } = result;
  const page = filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isSearch = (filters.query ?? "").trim().length > 0;

  function filterQuery(overrides: Partial<ExploreFilters>): Record<string, string> {
    const merged = { ...filters, ...overrides };
    const query: Record<string, string> = {};
    if (merged.category && merged.category !== "all") query.category = merged.category;
    if (merged.query) query.q = merged.query;
    if (merged.groupSize && merged.groupSize !== "any") query.groupSize = merged.groupSize;
    if (merged.locale && merged.locale !== "any") query.locale = merged.locale;
    if (merged.difficulty && merged.difficulty !== "any") query.difficulty = merged.difficulty;
    if (merged.spice && merged.spice !== "any") query.spice = merged.spice;
    return query;
  }

  // page is deliberately never carried into a filter change — changing any
  // dimension resets to page 1, same as the pre-existing category filter's
  // behavior. filterQuery() never emits `page` at all, which is exactly
  // right for this function but meant Previous/Next (below) silently lost
  // their target page — fixed by giving pagination its own href builder
  // rather than overloading this one.
  function hrefFor(overrides: Partial<ExploreFilters>): ExploreHref {
    return { pathname: "/explore", query: filterQuery(overrides) };
  }

  function pageHref(targetPage: number): ExploreHref {
    const query = filterQuery({});
    if (targetPage > 1) query.page = String(targetPage);
    return { pathname: "/explore", query };
  }

  // Carries the current filters (Who/Where/Effort/Edge/category) but not
  // the search query — "surprise me" is a browse affordance, not a search
  // one — plus the surprise=1 flag the component reads above to redirect.
  const surpriseHref: ExploreHref = {
    pathname: "/explore",
    query: { ...filterQuery({ query: undefined }), surprise: "1" },
  };

  return (
    <>
      <AppNav active="/explore" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--index guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-6 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
          <span>Page 02 - Index</span>
          <span>{isSearch ? `${quests.length} shown` : `${total} total`}</span>
        </div>

        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
          The index
        </h1>
        {/*
          Was "Search finds meaning, not just matching words — try a whole
          sentence." That describes the semantic path, which is unreachable
          in production: LLM_API_URL points at a local Ollama that Vercel
          can't resolve, so every live search falls back to keyword
          matching. The copy promised something only ever true on a dev
          machine. This describes what search actually does on the
          deployed site; restore the old line if a reachable embedding
          endpoint is ever configured.
        */}
        <p className="text-ink-mid max-w-[52ch] mb-6">
          491 things, seeded. Search by keyword, or filter your way down —
          the more specific the word, the better this works.
        </p>

        <div className="flex items-center justify-between gap-4 mb-5">
          <SearchBox defaultValue={filters.query ?? ""} />
          <Link
            href={surpriseHref}
            className="flex-none font-mono text-s-minus-1 uppercase tracking-wide text-ink-faint border-b border-transparent hover:text-ink hover:border-ink whitespace-nowrap"
          >
            Deal me something
          </Link>
        </div>

        <CategoryFilters categories={categories} active={filters.category ?? "all"} hrefFor={(category) => hrefFor({ category })} />
        <DimensionFilters
          groupSize={filters.groupSize ?? "any"}
          locale={filters.locale ?? "any"}
          difficulty={filters.difficulty ?? "any"}
          spice={filters.spice ?? "any"}
          hrefFor={(dimension, key) => hrefFor({ [dimension]: key })}
        />

        <p className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide mb-4 -mt-1">
          {ORDER_NOTE[orderedBy]}
        </p>

        {quests.length === 0 ? (
          <div className="py-14">
            <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[22ch]">
              Nothing matches that.
            </p>
            <p className="text-ink-mid mt-3 max-w-[40ch]">
              Try fewer words, or loosen a filter — there are 491 entries in
              here somewhere.
            </p>
            <Link
              href="/explore"
              className="inline-block mt-5 border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page"
            >
              Clear everything
            </Link>
          </div>
        ) : (
          <ul className="plate-rows list-none columns-1 md:columns-2 gap-10 mt-2">
            {quests.map((quest) => (
              <li
                key={quest.id}
                className="break-inside-avoid py-[0.9rem] border-b border-rule-fine flex flex-wrap gap-3.5 items-baseline"
              >
                <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint w-[4.6rem] flex-none">
                  {quest.category.replace(/_/g, " ")}
                </span>
                <div className="flex-1 min-w-[12ch]">
                  <h2 className="font-display font-medium text-s-0 leading-[1.3] text-ink">
                    {quest.title}
                  </h2>
                  <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-1">
                    {quest.groupSize} · {quest.locale.replace(/_/g, " ")} · eff {LEVEL_MARK[quest.difficulty] ?? quest.difficulty} · edge{" "}
                    {LEVEL_MARK[quest.spice] ?? quest.spice}
                  </p>
                </div>
                <RemixButton title={quest.title} category={quest.category} />
                <AddButton questId={quest.id} alreadyAdded={quest.alreadyAdded} />
              </li>
            ))}
          </ul>
        )}

        {!isSearch && totalPages > 1 && (
          <nav
            aria-label="Index pages"
            className="flex items-center justify-between mt-8 pt-4 border-t border-rule font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide"
          >
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-ink hover:underline">
                Previous
              </Link>
            ) : (
              <span aria-hidden="true">Previous</span>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-ink hover:underline">
                Next
              </Link>
            ) : (
              <span aria-hidden="true">Next</span>
            )}
          </nav>
        )}
      </PlateTilt>
      </main>
    </>
  );
}
