import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getIncomingRequests, getOutgoingRequests, getActiveConnections } from "@/lib/queries/connections";
import { ConnectionActions } from "./connection-actions";
import { AppNav } from "@/app/app-nav";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [incoming, outgoing, active] = await Promise.all([
    getIncomingRequests(user.id),
    getOutgoingRequests(user.id),
    getActiveConnections(user.id),
  ]);

  return (
    <>
      <AppNav active="/connections" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">
          Connections
        </h1>
        <p className="text-ink-mid mb-8">
          "I'm in" only reveals anything once both sides accept. Revocable
          any time, by either side.
        </p>

        <section className="mb-10">
          <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
            Waiting on you ({incoming.length})
          </h2>
          {incoming.length === 0 ? (
            <p className="text-ink-faint text-s-minus-1">Nothing pending.</p>
          ) : (
            <ul className="list-none">
              {incoming.map((c) => (
                <li key={c.id} className="py-3 border-b border-rule-fine">
                  <p>
                    <span className="font-medium">@{c.interestedHandle}</span> wants in on{" "}
                    <span className="italic">{c.itemTitle}</span>
                    {c.isAnonymousItem && (
                      <span className="font-mono text-s-minus-2 text-ink-faint">
                        {" "}
                        (accepting reveals your handle to them)
                      </span>
                    )}
                  </p>
                  <ConnectionActions connectionId={c.id} kind="incoming" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-10">
          <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
            Waiting on them ({outgoing.length})
          </h2>
          {outgoing.length === 0 ? (
            <p className="text-ink-faint text-s-minus-1">Nothing pending.</p>
          ) : (
            <ul className="list-none">
              {outgoing.map((c) => (
                <li key={c.id} className="py-3 border-b border-rule-fine text-ink-mid">
                  You said you're in on <span className="italic">{c.itemTitle}</span>. Waiting on them to accept.
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
            Connected ({active.length})
          </h2>
          {active.length === 0 ? (
            <p className="text-ink-faint text-s-minus-1">No active connections.</p>
          ) : (
            <ul className="list-none">
              {active.map((c) => {
                const counterpartHandle = c.ownerId === user.id ? c.interestedHandle : c.ownerHandle;
                return (
                  <li key={c.id} className="py-3 border-b border-rule-fine">
                    <p>
                      Connected with <span className="font-medium">@{counterpartHandle}</span> over{" "}
                      <span className="italic">{c.itemTitle}</span>
                    </p>
                    <ConnectionActions connectionId={c.id} kind="active" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </article>
      </main>
    </>
  );
}
