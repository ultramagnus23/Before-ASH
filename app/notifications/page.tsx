import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getNotifications, markAllNotificationsRead } from "@/lib/queries/notifications";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";

/*
 * The only delivery channel in the product. No push, no email, no digest —
 * you see these when you come here, and the nav badge is what brings you.
 *
 * Opening the page marks everything read. That is deliberate: a manual
 * "mark as read" control is one more thing to tap for no information gain,
 * and there are at most four kinds of thing in here.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const notifications = await getNotifications();
  await markAllNotificationsRead();

  return (
    <>
      <AppNav active="/notifications" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--wire guilloche relative w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <div className="plate-eyebrow flex justify-between items-baseline font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide pb-2 border-b border-rule">
            <span>Notices</span>
          </div>

          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mt-6 mb-1">
            What happened
          </h1>
          <p className="text-ink-mid max-w-[52ch] mb-7">
            Someone wanting to do the same thing as you, a connection, or a
            board you&rsquo;re on. Nothing else gets to interrupt you.
          </p>

          {notifications.length === 0 ? (
            <div className="py-14">
              <p className="font-display font-medium text-s-2 leading-[1.15] max-w-[24ch]">
                Nothing yet.
              </p>
              <p className="text-ink-mid mt-3 max-w-[40ch]">
                Say you&rsquo;re in on something from the index. When someone
                else says it too, you&rsquo;ll both hear about it here.
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
              {notifications.map((n) => {
                const body = (
                  <>
                    <div className="flex items-baseline gap-2.5">
                      {n.unread && (
                        <span
                          aria-label="Unread"
                          className="inline-block w-1.5 h-1.5 rounded-full bg-stamp-teal flex-none translate-y-[-1px]"
                        />
                      )}
                      <h2 className="font-display font-medium text-s-1 leading-[1.24] text-ink">{n.title}</h2>
                    </div>
                    {n.detail && <p className="text-ink-mid mt-1">{n.detail}</p>}
                    <p className="font-mono text-s-minus-2 text-ink-faint tracking-wide mt-1">
                      {new Date(n.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </>
                );

                return (
                  <li key={n.id} className="wire-row py-3.5">
                    {n.href ? (
                      // typedRoutes can't verify a href built at runtime from
                      // a notification payload. The set of shapes is closed
                      // and enumerated in present() in lib/queries/notifications.ts.
                      <Link href={n.href as Route} className="block hover:opacity-80">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PlateTilt>
      </main>
    </>
  );
}
