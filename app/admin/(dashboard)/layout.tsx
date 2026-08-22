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

  return <>{children}</>;
}
