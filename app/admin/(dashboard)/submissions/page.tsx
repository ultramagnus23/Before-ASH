import { getSubmissionQueue } from "@/lib/queries/submissions";
import { getCategories } from "@/lib/queries/explore";
import { SubmissionQueue } from "./submission-queue";
import { InviteForm } from "./invite-form";

/*
 * The curator queue — stage three of publishing.
 *
 * Everything here has already passed the deterministic filter and the
 * classifier. What is left is the judgement call, which is the part that was
 * never going to be automatable: does this belong in the index.
 *
 * Guarded by app/admin/(dashboard)/layout.tsx — the existing ADMIN_HANDLES
 * plus fresh-MFA gate. This route adds no auth of its own.
 */
export default async function SubmissionsPage() {
  const [queue, categories] = await Promise.all([getSubmissionQueue(), getCategories()]);

  return (
    <div className="max-w-[72ch]">
      <h1 className="font-display font-extrabold text-s-2 mb-1">Submissions</h1>
      <p className="text-ink-mid mb-6">
        Past the filter and the classifier. The rest is your call.
      </p>

      <InviteForm />

      {queue.length === 0 ? (
        <p className="text-ink-mid mt-8">Nothing waiting.</p>
      ) : (
        <SubmissionQueue items={queue} categories={categories} />
      )}
    </div>
  );
}
