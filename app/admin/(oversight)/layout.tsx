import Link from "next/link";
import { redirect } from "next/navigation";
import { checkOversightAccess } from "@/lib/admin/guard";

/*
 * Read-only oversight surface (admins + OVERSIGHT_HANDLES). Same route-group
 * reasoning as app/admin/(dashboard)/layout.tsx. Nothing under this group may
 * import or call a mutating admin action.
 */
export default async function OversightLayout({ children }: { children: React.ReactNode }) {
  const access = await checkOversightAccess();

  if (access.status === "not_admin") redirect("/list");
  if (access.status === "needs_enrollment") redirect("/admin/enroll");
  if (access.status === "needs_verification") redirect("/admin/verify");

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 bg-page text-ink">
      <nav aria-label="Oversight" className="flex flex-wrap gap-4 font-mono text-s-minus-1 uppercase tracking-wide mb-8">
        <Link href="/admin/overview" className="text-ink-mid hover:text-ink">
          Overview
        </Link>
        <Link href="/admin/audit" className="text-ink-mid hover:text-ink">
          Audit log
        </Link>
        {access.role === "admin" && (
          <Link href="/admin" className="text-ink-mid hover:text-ink">
            Safety queue
          </Link>
        )}
        <span className="ml-auto text-ink-faint normal-case tracking-normal">
          @{access.handle} · {access.role === "admin" ? "admin" : "read-only oversight"}
        </span>
      </nav>
      {children}
    </div>
  );
}
