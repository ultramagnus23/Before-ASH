import { getTagReviewQueue, getTagReviewProgress } from "@/lib/queries/tags";
import { TagReviewer } from "./tag-reviewer";

/*
 * Task 2's review tool. Guarded by app/admin/(dashboard)/layout.tsx, which
 * is the existing ADMIN_HANDLES + fresh-MFA gate -- this route deliberately
 * adds no auth logic of its own.
 *
 * A page of the queue is loaded at once rather than one item per request:
 * reviewing 491 items is a sitting, and a round trip between every keystroke
 * would make it one. Commits go one at a time in the background.
 */
export default async function TagReviewPage() {
  const [queue, progress] = await Promise.all([getTagReviewQueue(25), getTagReviewProgress()]);

  return (
    <div className="max-w-[72ch]">
      <h1 className="font-display font-extrabold text-s-2 mb-1">Tag review</h1>
      <p className="text-ink-mid mb-6">
        Machine proposals, least confident first. Nothing here is visible to
        anyone until you confirm it.{" "}
        <span className="font-mono text-s-minus-1 text-ink-faint">
          {progress.remaining} left · {progress.reviewed} done
        </span>
      </p>

      {queue.length === 0 ? (
        <p className="text-ink-mid">
          Queue is empty. Run <code className="font-mono">npm run pretag</code> to propose tags for
          untagged items.
        </p>
      ) : (
        <TagReviewer items={queue} />
      )}
    </div>
  );
}
