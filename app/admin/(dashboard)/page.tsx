import { getReviewQueue } from "@/lib/queries/admin";
import { ReviewQueue } from "./review-queue";

export default async function AdminPage() {
  const items = await getReviewQueue();

  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12 bg-void">
      <article className="w-full max-w-[64ch] bg-page text-ink px-5 sm:px-9 pt-10 pb-10 rounded-[2px_5px_5px_2px]">
        <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">
          Review queue ({items.length})
        </h1>
        <p className="text-ink-mid mb-8 max-w-[52ch]">
          One item at a time. Appealed items float to the top. You see item
          text, category, account-age bucket, and prior-rejection count —
          never who wrote it.
        </p>
        <ReviewQueue items={items} />
      </article>
    </main>
  );
}
