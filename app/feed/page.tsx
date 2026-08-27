import Link from "next/link";
import { getFeedPage } from "@/lib/queries/list-items";
import { FeedList } from "./feed-list";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

export default async function FeedPage() {
  const firstPage = await getFeedPage(null);

  return (
    <>
      <AppNav active="/feed" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
          <span>Page 03 - Wire</span>
          <span>Campus, live</span>
        </div>

        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
          What people did
        </h1>
        <p className="text-ink-mid max-w-[52ch] mb-7">
          Chronological. No algorithm. Anonymous entries carry no handle,
          not a hidden one.
        </p>

        {firstPage.items.length === 0 ? (
          <div className="py-14">
            <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[22ch]">
              Nothing stamped publicly yet.
            </p>
            <p className="text-ink-mid mt-3 max-w-[40ch]">
              Public and anonymous items wait for review before they show up
              here — nothing appears until that&apos;s cleared.
            </p>
            <Link
              href="/list"
              className="inline-block mt-5 border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page"
            >
              Go stamp something
            </Link>
          </div>
        ) : (
          <FeedList initialItems={firstPage.items} initialCursor={firstPage.nextCursor} />
        )}
      </PlateTilt>
      </main>
    </>
  );
}
