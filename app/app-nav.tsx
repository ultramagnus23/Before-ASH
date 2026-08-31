import Link from "next/link";

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
    </nav>
  );
}
