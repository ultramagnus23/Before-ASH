import Link from "next/link";
import { redirect } from "next/navigation";
import { getTonight } from "@/lib/queries/tonight";
import { campusNow, bucketFor } from "@/lib/tonight/select";
import { AddButton } from "@/app/explore/add-button";
import { CountMeInButton } from "@/app/explore/count-me-in-button";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { getCurrentUser } from "@/lib/auth/current-user";

/*
 * Tonight -- a handful of things doable in the next 48 hours, chosen against
 * the campus clock and reshuffled daily.
 *
 * No counts anywhere on this page: not how many are shown, not how many
 * were considered, not how many are left. The list is meant to read as a
 * suggestion you can take or ignore, and any number turns it into a set to
 * get through. It is also why there is no "seen it" control -- the shuffle
 * moves on by itself tomorrow.
 */

const GREETING: Record<string, string> = {
  morning: "This morning",
  afternoon: "This afternoon",
  evening: "Tonight",
  late_night: "Right now, at this hour",
};

const OPENER: Record<string, string> = {
  morning: "Before the day gets away from you.",
  afternoon: "The stretch nobody plans anything for.",
  evening: "The good hours. Pick one.",
  late_night: "Everything's shut. That narrows it usefully.",
};

export default async function TonightPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = new Date();
  const bucket = bucketFor(campusNow(now).hour);
  const items = await getTonight(user.id, now);

  return (
    <>
      <AppNav active="/tonight" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>Tonight</span>
          </div>

          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
            {GREETING[bucket]}
          </h1>
          <p className="text-ink-mid max-w-[52ch] mb-7">
            {OPENER[bucket]} This changes on its own tomorrow — nothing here
            needs clearing.
          </p>

          {items.length === 0 ? (
            <div className="py-14">
              <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[24ch]">
                Nothing to suggest yet.
              </p>
              <p className="text-ink-mid mt-3 max-w-[40ch]">
                The index is still there in the meantime.
              </p>
              <Link
                href="/explore"
                className="inline-block mt-5 border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page"
              >
                Browse the index
              </Link>
            </div>
          ) : (
            <ul className="plate-rows list-none">
              {items.map((item) => (
                <li key={item.id} className="wire-row py-4 flex flex-wrap gap-3.5 items-baseline">
                  <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint w-[4.6rem] flex-none">
                    {item.category.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-[14ch]">
                    <h2 className="font-display font-medium text-s-1 leading-[1.24] text-ink">
                      <Link href={`/q/${item.slug}`} className="hover:opacity-80">
                        {item.title}
                      </Link>
                    </h2>
                  </div>
                  <AddButton questId={item.id} alreadyAdded={item.alreadyAdded} />
                  <CountMeInButton questId={item.id} initiallyIn={item.countedIn} />
                </li>
              ))}
            </ul>
          )}
        </PlateTilt>
      </main>
    </>
  );
}
