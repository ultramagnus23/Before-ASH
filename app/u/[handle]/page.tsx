import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getPublicItemsByOwnerHandle } from "@/lib/queries/list-items";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { avatarDataUri } from "@/lib/avatar";

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, bio, bio_visible, avatar_seed")
    .eq("handle", handle)
    .maybeSingle();

  if (!profile) notFound();

  const items = await getPublicItemsByOwnerHandle(handle);

  return (
    <>
      <AppNav active="/feed" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <PlateTilt className="plate-enter plate--bearer w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <div className="flex items-start gap-5 mb-8">
          {/* The passport's photo box — never a real photo (BUILD-PROMPT.md
              "no photos, anywhere, in v1"), always this deterministic mark
              generated from the handle, the same one lib/avatar.ts already
              computed for every profile but that no page actually rendered
              until now. */}
          <div className="portrait-frame flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not a remote image; next/image has nothing to optimize here */}
            <img src={avatarDataUri(profile.avatar_seed, 56)} alt="" width={56} height={56} />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em]">
              @{profile.handle}
            </h1>
            {profile.bio_visible && profile.bio && <p className="text-ink-mid mt-2 max-w-[46ch]">{profile.bio}</p>}
          </div>
        </div>

        <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3 mt-4">
          Stamped publicly ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="text-ink-faint text-s-minus-1">Nothing public yet.</p>
        ) : (
          <ul className="plate-rows list-none">
            {items.map((item) => (
              <li key={item.id} className="py-3 border-b border-rule-fine">
                <h3 className="font-display font-medium text-s-0 text-ink">{item.title}</h3>
                {item.proof && <p className="text-ink-mid italic mt-1">"{item.proof}"</p>}
              </li>
            ))}
          </ul>
        )}
      </PlateTilt>
      </main>
    </>
  );
}
