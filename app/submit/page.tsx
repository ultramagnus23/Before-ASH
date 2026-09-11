import Link from "next/link";
import { redirect } from "next/navigation";
import { getCategories } from "@/lib/queries/explore";
import { getMySubmissions, canIPublish } from "@/lib/queries/submissions";
import { SubmitForm } from "./submit-form";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { getCurrentUser } from "@/lib/auth/current-user";

const STATE_COPY: Record<string, string> = {
  pending_auto: "with the curator",
  pending_human: "with the curator",
  held: "with the curator",
  flagged: "with the curator",
  approved: "in the index",
  rejected: "not taken",
};

/*
 * Proposing something for the shared catalog. Invite-only.
 *
 * Everyone sees their own submissions and nothing else — a feed of other
 * people's rejected ideas is not a thing this product should have.
 */
export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [invited, mine, allCategories] = await Promise.all([
    canIPublish(),
    getMySubmissions(),
    getCategories(),
  ]);

  // getCategories() is built for the /explore filter bar, so its first
  // entry is the "all" pseudo-category ("Everything"). That is a filter,
  // not a place an item can belong, and offering it here would have let a
  // submission be filed under a category that does not exist.
  const categories = allCategories.filter((c) => c.key !== "all");

  return (
    <>
      <AppNav active="/submit" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>Submit</span>
          </div>

          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
            Something missing?
          </h1>
          <p className="text-ink-mid max-w-[52ch] mb-7">
            Propose it for the index. If it goes in, it goes in with your name
            on it.
          </p>

          {invited ? (
            <SubmitForm categories={categories} />
          ) : (
            <div className="border border-rule px-5 py-5 mb-8">
              <p className="font-display font-medium text-s-1 mb-2">Invite-only for now.</p>
              <p className="text-ink-mid max-w-[46ch]">
                The index is small and hand-kept on purpose. If you&rsquo;ve got
                something for it,{" "}
                <Link href="/grievance" className="underline hover:text-ink">
                  say so here
                </Link>{" "}
                and it&rsquo;ll get read.
              </p>
            </div>
          )}

          {mine.length > 0 && (
            <>
              <h2 className="font-display font-medium text-s-1 mt-10 mb-3">What you&rsquo;ve sent</h2>
              <ul className="list-none">
                {mine.map((submission) => (
                  <li
                    key={submission.id}
                    className="flex items-baseline justify-between gap-4 py-2 border-b border-rule-fine"
                  >
                    <span>{submission.title}</span>
                    <span className="font-mono text-s-minus-2 text-ink-faint uppercase tracking-wide flex-none">
                      {STATE_COPY[submission.reviewState] ?? "with the curator"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </PlateTilt>
      </main>
    </>
  );
}
