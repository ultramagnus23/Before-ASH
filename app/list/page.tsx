import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOwnList } from "@/lib/queries/list-items";
import { getCategories } from "@/lib/queries/explore";
import { AddCustomForm } from "./add-custom-form";
import { ImportPanel } from "./import-panel";
import { ListRow } from "./row";
import { ToastProvider } from "./toast";
import { DeleteAccountButton } from "./delete-account-button";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { isAnonymousReviewEnabled, isAnonymousPaused } from "@/lib/moderation/anonymous-review";
import { getWeeklyFeaturedQuest } from "@/lib/queries/featured";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

function padMrz(value: string, length: number): string {
  return (value + "<".repeat(length)).slice(0, length);
}

export default async function ListPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/");

  // The profile select used to sit on its own line between the auth call and
  // this Promise.all, despite depending on nothing in it -- a whole serial
  // round trip to ap-southeast-1 for one handle. PERF-BASELINE.md §6.
  const anonEnabled = isAnonymousReviewEnabled();
  const [{ data: profile }, items, categories, anonStatus, featured] = await Promise.all([
    supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle(),
    getOwnList(user.id),
    getCategories(),
    anonEnabled ? isAnonymousPaused() : Promise.resolve({ paused: false, pendingCount: 0 }),
    getWeeklyFeaturedQuest(),
  ]);
  const doneCount = items.filter((i) => i.completedAt).length;

  const mrzLine1 = "P<IND" + padMrz("BEFOREASH", 8) + padMrz(profile?.handle?.toUpperCase() ?? "", 30);
  // Was BWA<done>OF<total>, which is a completion fraction hidden in a
  // monospace font -- the passport styling made it look like set dressing,
  // but "20 OF 60" is exactly the thing the product must never say. The
  // document number is now the handle, which is what a passport number
  // actually is: an identifier, not a score.
  const mrzLine2 =
    padMrz("BWA" + (profile?.handle?.toUpperCase() ?? "").replace(/[^A-Z0-9]/g, ""), 14) +
    "IND<UG<<" +
    padMrz("STAMPED" + doneCount, 20);

  return (
    <>
      <AppNav active="/list" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--data guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
          <span>Page 01 - My list</span>
          {/* A count of what you have done, with nothing to measure it
              against. The denominator is the whole problem: it turns a list
              of things you want to do into a list of things you have not. */}
          <span>{doneCount} stamped</span>
        </div>

        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
          Your list, @{profile?.handle}
        </h1>
        <p className="text-ink-mid max-w-[52ch] mb-2">
          Add from the <Link href="/explore" className="underline">index</Link> or write your own below.
          Press and hold the mark to stamp something. It should take a
          second. That&apos;s deliberate.
        </p>
        <p className="mb-7">
          <Link href="/list/passport" className="font-mono text-s-minus-1 text-ink-faint underline hover:text-ink">
            View your passport
          </Link>
        </p>

        {featured && (
          <p className="font-mono text-s-minus-1 text-ink-mid border-b border-rule-fine pb-4 mb-6">
            This week:{" "}
            <Link href={`/q/${featured.slug}`} className="underline text-ink">
              {featured.title}
            </Link>
          </p>
        )}

        <AddCustomForm categories={categories.filter((c) => c.key !== "all")} />
        <ImportPanel categories={categories.filter((c) => c.key !== "all")} />

        {anonStatus.paused && (
          <p className="font-mono text-s-minus-1 text-error border border-stamp-vermilion/40 px-3 py-2 mb-6">
            Anonymous is paused. Back soon.
          </p>
        )}

        {items.length === 0 ? (
          <div className="py-14">
            <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[22ch]">
              Nothing here yet.
            </p>
            <p className="text-ink-mid mt-3 max-w-[40ch]">
              Two ways in: pick something from the index, or write down a
              thing you&rsquo;ve been meaning to do above.
            </p>
            <Link
              href="/explore"
              className="inline-block mt-5 border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page"
            >
              Browse the index
            </Link>
          </div>
        ) : (
          <ToastProvider>
            <ul className="plate-rows list-none mt-4">
              {items.map((item) => (
                <ListRow key={item.id} item={item} anonEnabled={anonEnabled && !anonStatus.paused} />
              ))}
            </ul>
          </ToastProvider>
        )}

        <div className="mt-10 -mx-5 sm:-mx-9 px-5 sm:px-9 py-4 bg-page-sunk border-t border-rule font-mono text-[clamp(0.6rem,2.1vw,0.833rem)] text-ink-mid leading-relaxed whitespace-nowrap overflow-x-auto">
          <div>{mrzLine1}</div>
          <div>{mrzLine2}</div>
        </div>

        <div className="py-4">
          <Link href="/settings" className="font-mono text-s-minus-1 text-ink-faint underline">
            Settings
          </Link>
        </div>
        <DeleteAccountButton />
      </PlateTilt>
      </main>
    </>
  );
}
