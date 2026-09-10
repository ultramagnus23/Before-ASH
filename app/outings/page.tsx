import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyOutings } from "@/lib/queries/outings";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

/*
 * The outings you're in.
 *
 * Task 1 created these groups and told both people about them, but there was
 * nowhere to actually go — the notification pointed at the catalog entry.
 * This is that missing surface, and it is where split-cost lives.
 */
export default async function OutingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const outings = await getMyOutings();

  return (
    <>
      <AppNav active="/outings" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>Outings</span>
          </div>

          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
            Who you&rsquo;re doing things with
          </h1>
          <p className="text-ink-mid max-w-[52ch] mb-7">
            One of these appears when someone else says they&rsquo;re in on the
            same thing as you. Costs get split in here.
          </p>

          {outings.length === 0 ? (
            <div className="py-14">
              <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[24ch]">
                No outings yet.
              </p>
              <p className="text-ink-mid mt-3 max-w-[40ch]">
                Say you&rsquo;re in on something. When someone else says it too,
                you&rsquo;ll both end up here.
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
              {outings.map((outing) => (
                <li key={outing.id} className="wire-row py-3.5">
                  <Link href={`/outings/${outing.id}` as Route} className="block hover:opacity-80">
                    <h2 className="font-display font-medium text-s-1 leading-[1.24] text-ink">
                      {outing.questTitle}
                    </h2>
                    <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-1">
                      {outing.memberCount === 1 ? "just you so far" : `${outing.memberCount} of you`}
                      {" · "}
                      {new Date(outing.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PlateTilt>
      </main>
    </>
  );
}
