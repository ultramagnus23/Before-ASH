import { searchQuests, getCategories } from "@/lib/queries/explore";
import { CategoryFilters } from "./filters";
import { AddButton } from "./add-button";
import { SearchBox } from "./search-box";
import { RemixButton } from "./remix-button";
import { AppNav } from "@/app/app-nav";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const category = params.category ?? "all";
  const query = params.q ?? "";

  const [quests, categories] = await Promise.all([
    searchQuests({ query, category }),
    getCategories(),
  ]);

  return (
    <>
      <AppNav active="/explore" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-6 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
          <span>Page 02 - Index</span>
          <span>{quests.length} shown</span>
        </div>

        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
          The index
        </h1>
        <p className="text-ink-mid max-w-[52ch] mb-6">
          491 things, seeded. Search finds meaning, not just matching words —
          try a whole sentence.
        </p>

        <SearchBox defaultValue={query} />
        <CategoryFilters categories={categories} active={category} query={query} />

        {quests.length === 0 ? (
          <div className="py-14">
            <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[22ch]">
              Nothing matches that.
            </p>
          </div>
        ) : (
          <ul className="list-none columns-1 md:columns-2 gap-10 mt-2">
            {quests.map((quest) => (
              <li
                key={quest.id}
                className="break-inside-avoid py-[0.9rem] border-b border-rule-fine flex flex-wrap gap-3.5 items-baseline"
              >
                <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint w-[4.6rem] flex-none">
                  {quest.category.replace(/_/g, " ")}
                </span>
                <h4 className="font-display font-medium text-s-0 leading-[1.3] text-ink flex-1">
                  {quest.title}
                </h4>
                <RemixButton title={quest.title} category={quest.category} />
                <AddButton questId={quest.id} alreadyAdded={quest.alreadyAdded} />
              </li>
            ))}
          </ul>
        )}
      </article>
      </main>
    </>
  );
}
