import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getMyBoards, getPendingInvites, getDiscoverableBoards } from "@/lib/queries/boards";
import { AppNav } from "@/app/app-nav";
import { PlateTilt } from "@/app/plate-tilt";
import { CreateBoardForm } from "./create-board-form";
import { InviteResponse } from "./invite-response";
import { JoinRequestButton } from "./join-request-button";
import Link from "next/link";

export default async function BoardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [myBoards, invites, discoverable] = await Promise.all([
    getMyBoards(user.id),
    getPendingInvites(user.id),
    getDiscoverableBoards(user.id),
  ]);

  return (
    <>
      <AppNav active="/boards" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <PlateTilt className="plate-enter plate--register w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">Boards</h1>
          <p className="text-ink-mid max-w-[52ch] mb-8">
            A shared suggestion list a group curates together. Doing something on a board still just adds it to
            your own list — stamping stays personal.
          </p>

          <CreateBoardForm />

          {invites.length > 0 && (
            <section className="register-section mb-10 mt-10">
              <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
                Invited ({invites.length})
              </h2>
              <ul className="plate-rows list-none">
                {invites.map((inv) => (
                  <li key={inv.boardMemberId} className="py-3 border-b border-rule-fine">
                    <p>
                      {inv.invitedByHandle ? `@${inv.invitedByHandle}` : "Someone"} invited you to{" "}
                      <strong>{inv.boardName}</strong> as {inv.role}
                    </p>
                    <InviteResponse boardMemberId={inv.boardMemberId} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="register-section mb-10 mt-10">
            <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
              Your boards ({myBoards.length})
            </h2>
            {myBoards.length === 0 ? (
              <p className="text-ink-faint text-s-minus-1">None yet.</p>
            ) : (
              <ul className="plate-rows list-none">
                {myBoards.map((board) => (
                  <li key={board.id} className="py-3 border-b border-rule-fine flex justify-between items-baseline">
                    <div>
                      <Link href={`/boards/${board.id}`} className="font-display font-medium text-s-1 text-ink hover:underline">
                        {board.name}
                      </Link>
                      {board.description && <p className="text-ink-mid text-s-minus-1 mt-0.5">{board.description}</p>}
                      <div className="signature-line" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-s-minus-2 uppercase text-ink-faint">{board.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="register-section mt-10">
            <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">
              Looking for people ({discoverable.length})
            </h2>
            {discoverable.length === 0 ? (
              <p className="text-ink-faint text-s-minus-1">Nothing discoverable right now.</p>
            ) : (
              <ul className="plate-rows list-none">
                {discoverable.map((board) => (
                  <li key={board.id} className="py-3 border-b border-rule-fine">
                    <p className="font-display font-medium text-s-1 text-ink">{board.name}</p>
                    {board.description && <p className="text-ink-mid text-s-minus-1 mt-0.5">{board.description}</p>}
                    <JoinRequestButton boardId={board.id} alreadyRequested={board.alreadyRequested} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </PlateTilt>
      </main>
    </>
  );
}
