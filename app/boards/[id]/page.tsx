import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getBoardDetail, getBoardItems, getBoardMembers, getBoardJoinRequests } from "@/lib/queries/boards";
import { getCategories } from "@/lib/queries/explore";
import { AppNav } from "@/app/app-nav";
import { AddBoardItemForm } from "./add-item-form";
import { BoardItemCard } from "./board-item-card";
import { MemberList } from "./member-list";
import { InviteForm } from "./invite-form";
import { JoinRequestList } from "./join-request-list";

const CAN_CONTRIBUTE = ["owner", "editor", "contributor"];
const CAN_ADMIN = ["owner", "editor"];

export default async function BoardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const board = await getBoardDetail(id, user.id);
  if (!board || !board.myRole) notFound();

  const [items, categories, members, joinRequests] = await Promise.all([
    getBoardItems(id, user.id),
    getCategories(),
    CAN_ADMIN.includes(board.myRole) ? getBoardMembers(id) : Promise.resolve([]),
    CAN_ADMIN.includes(board.myRole) ? getBoardJoinRequests(id) : Promise.resolve([]),
  ]);

  const canContribute = CAN_CONTRIBUTE.includes(board.myRole);
  const canAdmin = CAN_ADMIN.includes(board.myRole);

  return (
    <>
      <AppNav active="/boards" />
      <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
        <article className="w-full max-w-[72ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px] shadow-[0_26px_60px_-24px_oklch(0.128_0.03_258/0.85)]">
          <p className="font-mono text-s-minus-2 uppercase tracking-wide text-ink-faint mb-2">
            Your role: {board.myRole}
            {board.discoverable && " · looking for people"}
          </p>
          <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">{board.name}</h1>
          {board.description && <p className="text-ink-mid max-w-[52ch] mb-8">{board.description}</p>}

          {canAdmin && (
            <section className="mb-10 border border-rule p-4">
              <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3">Manage</h2>
              <InviteForm boardId={id} />
              <MemberList members={members} myUserId={user.id} />
              {joinRequests.length > 0 && <JoinRequestList requests={joinRequests} />}
            </section>
          )}

          {canContribute && (
            <AddBoardItemForm boardId={id} categories={categories.filter((c) => c.key !== "all")} />
          )}

          <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-3 mt-8">
            Suggestions ({items.length})
          </h2>
          {items.length === 0 ? (
            <p className="text-ink-faint text-s-minus-1">Nothing here yet.</p>
          ) : (
            <ul className="list-none">
              {items.map((item) => (
                <BoardItemCard key={item.id} item={item} canContribute={canContribute} canAdmin={canAdmin} />
              ))}
            </ul>
          )}
        </article>
      </main>
    </>
  );
}
