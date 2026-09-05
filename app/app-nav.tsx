import Link from "next/link";
import { Suspense } from "react";
import { getUnreadNotificationCount } from "@/lib/queries/notifications";

const LINKS = [
  { href: "/list", label: "01 List" },
  { href: "/explore", label: "02 Index" },
  { href: "/feed", label: "03 Wire" },
  { href: "/vote", label: "04 Board" },
  { href: "/connections", label: "Connections" },
  { href: "/boards", label: "Boards" },
] as const;

// Server Component, no client JS — matches prototype.html's .index nav,
// just as real links instead of a client-side pane toggle, since each
// section is now a real route rather than a hidden <main>.
export function AppNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 flex items-center gap-1 px-4 sm:px-8 py-3 bg-cover/90 backdrop-blur-sm border-b border-foil/20"
    >
      <span className="mr-auto whitespace-nowrap leading-tight">
        <span className="block font-display font-extrabold text-s-minus-1 tracking-[0.16em] uppercase text-foil">
          Before ASH
        </span>
        <span className="block font-display text-s-minus-2 tracking-[0.3em] uppercase text-foil-dim">
          Ashoka · Sonipat
        </span>
      </span>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active === link.href ? "page" : undefined}
          className={`font-mono text-s-minus-1 tracking-wide px-2 py-1.5 ${
            // text-foil-dim, not an opacity-reduced text-foil: opacity
            // blends toward the background and quietly breaks contrast —
            // foil/55 on the cover background measures ~3.7:1, below
            // WCAG AA's 4.5:1 floor for this text size. --color-foil-dim
            // is a real, audited color (4.55:1) verified in
            // BUILD-PROMPT.md §11's contrast pass, not just a dimmer foil.
            active === link.href ? "text-page border-b border-foil" : "text-foil-dim hover:text-foil"
          }`}
        >
          {link.label}
        </Link>
      ))}

      <Link
        href="/notifications"
        aria-current={active === "/notifications" ? "page" : undefined}
        className={`font-mono text-s-minus-1 tracking-wide px-2 py-1.5 flex items-center gap-1.5 ${
          active === "/notifications" ? "text-page border-b border-foil" : "text-foil-dim hover:text-foil"
        }`}
      >
        Notices
        {/* Suspended so an unread lookup can never delay the nav, which
            renders on every route including the signed-out public pages.
            The badge simply appears a beat later when there is one. */}
        <Suspense fallback={null}>
          <UnreadDot />
        </Suspense>
      </Link>
    </nav>
  );
}

/*
 * A dot, not a number. The count of unread notices is not a denominator, so
 * §1 does not forbid it — but a number here invites "3 unread" to become a
 * thing to clear, and the product has exactly four notification types and no
 * inbox-zero mechanic. Presence is the whole signal.
 */
async function UnreadDot() {
  const unread = await getUnreadNotificationCount();
  if (unread === 0) return null;
  return (
    <span
      aria-label="You have unread notices"
      className="inline-block w-1.5 h-1.5 rounded-full bg-foil flex-none"
    />
  );
}
