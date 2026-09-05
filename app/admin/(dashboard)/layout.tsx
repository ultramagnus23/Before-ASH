import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAdminAccess } from "@/lib/admin/guard";

/*
 * Route-group layout (app/admin/(dashboard)/) so it guards /admin itself
 * without also wrapping app/admin/enroll and app/admin/verify, which live
 * as SIBLINGS outside this group. A layout at app/admin/layout.tsx would
 * wrap every route under /admin including enroll/verify, and since this
 * layout's own failure mode is "redirect to enroll/verify," that would be
 * an immediate infinite redirect loop.
 */
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await checkAdminAccess();

  if (access.status === "not_admin") redirect("/list");
  if (access.status === "needs_enrollment") redirect("/admin/enroll");
  if (access.status === "needs_verification") redirect("/admin/verify");

  // Two admin surfaces now (the safety queue and the tag queue), so there
  // has to be a way between them. Deliberately plain: this is tooling for
  // one person, not a product surface.
  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 bg-page text-ink">
      <nav aria-label="Admin" className="flex gap-4 font-mono text-s-minus-1 uppercase tracking-wide mb-8">
        <Link href="/admin" className="text-ink-mid hover:text-ink">
          Safety queue
        </Link>
        <Link href="/admin/tags" className="text-ink-mid hover:text-ink">
          Tag review
        </Link>
      </nav>
      {children}
    </div>
  );
}
