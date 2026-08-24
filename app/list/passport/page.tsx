import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnList } from "@/lib/queries/list-items";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { StampTile } from "./stamp-tile";

// The passport-object view — WORK-PROMPT-v3 Phase 3 item 2's chosen
// direction for "give the stamp a consequence beyond the row it sits in".
// Every stamp you've earned, together, rendered as the actual marks rather
// than a count — a visa page, not a dashboard. No streaks, no percentages,
// no milestones: just what's actually been stamped, oldest first, the way
// a real passport's pages fill in the order you travelled.
export default async function PassportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();

  const items = await getOwnList(user.id);
  const stamped = items
    .filter((i) => i.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  return (
    <>
      <AppNav active="/list" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--visa guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
          <Link href="/list" className="hover:text-ink">
            ← My list
          </Link>
          <span>{stamped.length} stamped</span>
        </div>

        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
          Your passport, @{profile?.handle}
        </h1>
        <p className="text-ink-mid max-w-[52ch] mb-8">
          Every mark, in the order you earned it.
        </p>

        {stamped.length === 0 ? (
          <div className="py-14">
            <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[22ch]">
              Nothing stamped yet.
            </p>
            <p className="text-ink-mid mt-3 max-w-[40ch]">
              This fills in as you go — the first thing you stamp lands here.
            </p>
            <Link
              href="/explore"
              className="inline-block mt-5 border border-ink px-4 py-2 font-mono text-s-minus-1 font-semibold transition-colors duration-150 hover:bg-ink hover:text-page"
            >
              Browse the index
            </Link>
          </div>
        ) : (
          <ul className="plate-rows grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
            {stamped.map((item) => (
              <StampTile
                key={item.id}
                id={item.id}
                category={item.category}
                questId={item.questId}
                title={item.title}
                completedAt={item.completedAt!}
              />
            ))}
          </ul>
        )}
      </PlateTilt>
      </main>
    </>
  );
}
