import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicItemsByQuestId } from "@/lib/queries/list-items";
import { getRelatedQuests } from "@/lib/queries/explore";
import { AddButton } from "@/app/explore/add-button";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

const LEVEL_MARK: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export default async function QuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: quest } = await supabase
    .from("quests")
    .select("id, title, category, difficulty, group_size, locale, spice, embedding")
    .eq("slug", slug)
    .maybeSingle();

  if (!quest) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [items, ownRow, related] = await Promise.all([
    getPublicItemsByQuestId(quest.id),
    user
      ? supabase.from("list_items").select("id").eq("owner_id", user.id).eq("quest_id", quest.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getRelatedQuests(quest.id, quest.embedding),
  ]);

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
