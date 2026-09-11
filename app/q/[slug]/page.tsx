import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicItemsByQuestId } from "@/lib/queries/list-items";
import { getRelatedQuests } from "@/lib/queries/explore";
import { bookingLinksFor } from "@/lib/booking/registry";
import { bandForLocale } from "@/lib/booking/types";
import { AddButton } from "@/app/explore/add-button";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { getCurrentUser } from "@/lib/auth/current-user";

const LEVEL_MARK: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export default async function QuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // Independent: who is asking has no bearing on which quest this is.
  // Running them in sequence put an auth round trip in front of the only
  // query the page actually needs to render anything.
  const [{ data: quest }, user] = await Promise.all([
    supabase
      .from("quests")
      .select("id, title, category, difficulty, group_size, locale, spice, embedding")
      .eq("slug", slug)
      .maybeSingle(),
    getCurrentUser(),
  ]);

  if (!quest) notFound();

  const [items, ownRow, related] = await Promise.all([
    getPublicItemsByQuestId(quest.id),
    user
      ? supabase.from("list_items").select("id").eq("owner_id", user.id).eq("quest_id", quest.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getRelatedQuests(quest.id, quest.embedding),
  ]);

  const bookingLinks = bookingLinksFor({
    title: quest.title,
    category: quest.category,
    band: bandForLocale(quest.locale),
  });

  return (
    <>
      <AppNav active="/explore" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--visa w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <p className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-2">
          {quest.category.replace(/_/g, " ")}
        </p>
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="font-display font-extrabold text-s-3 leading-[1.05] tracking-[-0.02em] max-w-[38ch]">
            {quest.title}
          </h1>
          <div className="flex-none pt-2">
            <AddButton questId={quest.id} alreadyAdded={Boolean(ownRow?.data)} />
          </div>
        </div>

        {/* Visa-conditions register: label:value rows in mono, thin rules,
            no colour fill — matches the DimensionFilters treatment on
            /explore (AUDIT-2026-08.md §1.2 finding C). */}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-0 font-mono text-s-minus-1 border-y border-rule-fine mb-8">
          <div className="flex justify-between py-2 border-b border-rule-fine">
            <dt className="text-ink-faint uppercase tracking-wide">Who</dt>
            <dd className="text-ink-mid">{quest.group_size}</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-rule-fine">
            <dt className="text-ink-faint uppercase tracking-wide">Where</dt>
            <dd className="text-ink-mid">{quest.locale.replace(/_/g, " ")}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-faint uppercase tracking-wide">Effort</dt>
            <dd className="text-ink-mid">{LEVEL_MARK[quest.difficulty] ?? quest.difficulty}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-faint uppercase tracking-wide">Edge</dt>
            <dd className="text-ink-mid">{LEVEL_MARK[quest.spice] ?? quest.spice}</dd>
          </div>
        </dl>

        <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
          Stamped by campus ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="text-ink-faint text-s-minus-1">No one&apos;s stamped this publicly yet.</p>
        ) : (
          <ul className="plate-rows list-none">
            {items.map((item) => (
              <li key={item.id} className="py-3 border-b border-rule-fine">
                <div className="font-mono text-s-minus-1 text-ink-faint">
                  {item.visibility === "anonymous" ? "Anonymous" : item.ownerHandle ? `@${item.ownerHandle}` : "Someone"}
                </div>
                {item.proof && <p className="text-ink-mid italic mt-1">&quot;{item.proof}&quot;</p>}
              </li>
            ))}
          </ul>
        )}

        {/*
            Task 5 -- deep links out, from config/booking-providers.json. These
            are search URLs: no company here has given this app an API, so
            nothing claims a price, a seat or an availability. It hands the
            query to a site the student already uses and stops there. Most of
            the catalog matches nothing and renders no section at all, which
            is correct -- you do not book a habit.
        */}
        {bookingLinks.length > 0 && (
          <div className="mt-10 pt-6 border-t border-rule">
            <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
              Getting to it
            </h2>
            <ul className="list-none flex flex-wrap gap-x-5 gap-y-2">
              {bookingLinks.map((link) => (
                <li key={link.providerId}>
                  <a
                    href={link.url}
                    target="_blank"
                    // noreferrer as well as noopener: these are third-party
                    // sites and there is no reason to tell them which page
                    // on a students' bucket-list app someone came from.
                    rel="noopener noreferrer"
                    className="font-mono text-s-minus-1 text-ink-mid border-b border-rule pb-px hover:text-ink hover:border-ink"
                  >
                    {link.label} &rarr;
                  </a>
                </li>
              ))}
            </ul>
            <p className="font-mono text-s-minus-2 text-ink-faint mt-3">
              These just search. Nothing here knows prices or availability.
            </p>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-10 pt-6 border-t border-rule">
            <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
              Closest in meaning
            </h2>
            <ul className="list-none">
              {related.map((r) => (
                <li key={r.id} className="py-2.5 border-b border-rule-fine flex items-baseline gap-3.5">
                  <span className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint w-[4.6rem] flex-none">
                    {r.category.replace(/_/g, " ")}
                  </span>
                  <Link href={`/q/${r.slug}`} className="flex-1 text-ink hover:underline">
                    {r.title}
                  </Link>
                  <AddButton questId={r.id} alreadyAdded={r.alreadyAdded} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </PlateTilt>
      </main>
    </>
  );
}
