import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getPublicItemsByQuestId } from "@/lib/queries/list-items";
import { AddButton } from "@/app/explore/add-button";

export default async function QuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: quest } = await supabase
    .from("quests")
    .select("id, title, category, difficulty, group_size, locale, spice")
    .eq("slug", slug)
    .maybeSingle();

  if (!quest) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [items, ownRow] = await Promise.all([
    getPublicItemsByQuestId(quest.id),
    user
      ? supabase.from("list_items").select("id").eq("owner_id", user.id).eq("quest_id", quest.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
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

        <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
          Stamped by campus ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="text-ink-faint text-s-minus-1">No one's stamped this publicly yet.</p>
        ) : (
          <ul className="list-none">
            {items.map((item) => (
              <li key={item.id} className="py-3 border-b border-rule-fine">
                <div className="font-mono text-s-minus-1 text-ink-faint">
                  {item.visibility === "anonymous" ? "Anonymous" : item.ownerHandle ? `@${item.ownerHandle}` : "Someone"}
                </div>
                {item.proof && <p className="text-ink-mid italic mt-1">"{item.proof}"</p>}
              </li>
            ))}
          </ul>
        )}
      </article>
    </main>
  );
}
