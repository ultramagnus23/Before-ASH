import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getPublicItemsByOwnerHandle } from "@/lib/queries/list-items";

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, bio, bio_visible")
    .eq("handle", handle)
    .maybeSingle();

  if (!profile) notFound();

  const items = await getPublicItemsByOwnerHandle(handle);

  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-2">
          @{profile.handle}
        </h1>
        {profile.bio_visible && profile.bio && <p className="text-ink-mid mb-8 max-w-[52ch]">{profile.bio}</p>}

        <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3 mt-4">
          Stamped publicly ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="text-ink-faint text-s-minus-1">Nothing public yet.</p>
        ) : (
          <ul className="list-none">
            {items.map((item) => (
              <li key={item.id} className="py-3 border-b border-rule-fine">
                <h3 className="font-display font-medium text-s-0 text-ink">{item.title}</h3>
                {item.proof && <p className="text-ink-mid italic mt-1">"{item.proof}"</p>}
              </li>
            ))}
          </ul>
        )}
      </article>
    </main>
  );
}
