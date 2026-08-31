import Link from "next/link";
import { getLeaderboard } from "@/lib/queries/leaderboard";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { AddButton } from "@/app/explore/add-button";
import { VoteButton } from "./vote-button";

const LEVEL_MARK: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export const metadata = { title: "The board — Before ASH" };

export default async function VotePage() {
  const { quests, totalVotes, signedIn } = await getLeaderboard();
  const hasAnyVotes = totalVotes > 0;

  return (
    <>
      <AppNav active="/vote" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--index guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-8 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>Page 04 - The board</span>
            <span>{totalVotes === 1 ? "1 vote cast" : `${totalVotes} votes cast`}</span>
          </div>

          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
            Coolest side quests
          </h1>
          <p className="text-ink-mid max-w-[52ch] mb-6">
            Voted by campus. Two numbers per entry, and they don&apos;t always
            agree — how many people think it&apos;s a great idea, and how many
            actually put it on their list.
          </p>

          {!signedIn && (
            <p className="font-mono text-s-minus-1 text-ink-mid border border-rule px-3 py-2.5 mb-6">
              <Link href="/?next=%2Fvote" className="underline text-ink">
                Sign in
              </Link>{" "}
              to vote. Anyone can read the board.
            </p>
          )}

          {!hasAnyVotes && (
            <p className="font-mono text-s-minus-1 text-ink-faint border-b border-rule-fine pb-4 mb-2">
              Nobody has voted yet — so this is just the catalog, in order.
              First vote decides the top.
            </p>
          )}

          <ul className="plate-rows list-none mt-2">
            {quests.map((quest, i) => (
              <li
                key={quest.id}
                className="py-3.5 border-b border-rule-fine flex items-start gap-3.5"
              >
                <span className="font-mono text-s-minus-1 text-ink-faint w-6 flex-none pt-3 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <VoteButton questId={quest.id} voteCount={quest.voteCount} hasVoted={quest.hasVoted} />

                <div className="flex-1 min-w-[12ch]">
                  <Link
                    href={`/q/${quest.slug}`}
                    className="font-display font-medium text-s-0 leading-[1.3] text-ink hover:underline"
                  >
                    {quest.title}
                  </Link>
                  <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-1">
                    {quest.category.replace(/_/g, " ")} · eff {LEVEL_MARK[quest.difficulty] ?? quest.difficulty} ·
                    edge {LEVEL_MARK[quest.spice] ?? quest.spice} ·{" "}
                    {/* Deliberately "on public lists", not a bare total —
                        quest_add_counts() is security invoker, so this only
                        ever counts rows the viewer's own RLS lets them see.
                        Calling it a total would be untrue. */}
                    {quest.addCount === 1 ? "on 1 public list" : `on ${quest.addCount} public lists`}
                  </p>
                </div>

                <div className="pt-1">
                  <AddButton questId={quest.id} alreadyAdded={quest.alreadyAdded} />
                </div>
              </li>
            ))}
          </ul>

          <p className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide mt-6">
            Top {quests.length} ·{" "}
            <Link href="/explore" className="underline hover:text-ink">
              browse all 491
            </Link>
          </p>
        </PlateTilt>
      </main>
    </>
  );
}
