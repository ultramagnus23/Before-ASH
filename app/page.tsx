import { CoverForm } from "./cover-form";
import { getTickerPreview } from "@/lib/queries/ticker";
import { getCategories } from "@/lib/queries/explore";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "ashoka.edu.in";

export default async function CoverPage() {
  const [ticker, categories] = await Promise.all([getTickerPreview(), getCategories()]);
  const realCategories = categories.filter((c) => c.key !== "all");

  return (
    <main className="cover-shell min-h-screen flex flex-col">
      <div className="plate-enter guilloche relative w-full max-w-[64ch] mx-auto px-4 py-24">
        <div className="h-px bg-gradient-to-r from-foil to-transparent mb-10" />
        <h1 className="font-display font-extrabold text-[clamp(2.6rem,9vw,4.209rem)] leading-[0.94] tracking-[-0.035em] text-page">
          Things worth doing<span className="block text-foil">before you leave.</span>
        </h1>
        <p className="mt-7 mb-10 max-w-[38ch] text-page/70 text-s-1">
          Pick some. Do them. Stamp them. Everything you finish lands on a page
          other people can copy from.
        </p>
        <CoverForm allowedDomain={ALLOWED_EMAIL_DOMAIN} />

        {/*
         * A page with only a form and an empty ticker is a blank room —
         * this was the actual first impression at zero completions
         * (AUDIT-2026-08.md §1.2 finding H). What's real and always true
         * regardless of usage: the 15 categories the catalog is actually
         * built from. Shown as a plain index strip, not a feature list —
         * the same eyebrow/number treatment /explore's filters use, so it
         * reads as a preview of that page rather than marketing copy.
         */}
        <div className="mt-14 border-t border-foil/20 pt-6">
          <p className="font-mono text-s-minus-1 text-page/50 uppercase tracking-wide mb-4">
            491 things, in 15 kinds
          </p>
          <ul className="list-none grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
            {realCategories.map((c, i) => (
              <li key={c.key} className="font-mono text-s-minus-1 text-page/70 leading-relaxed">
                <span className="text-page/40">{String(i + 1).padStart(2, "0")}</span> {c.label}
              </li>
            ))}
          </ul>
        </div>

        {ticker.length > 0 && (
          <div className="mt-10 border-t border-foil/20 pt-5" aria-label="Recently stamped">
            <p className="font-mono text-s-minus-2 text-page/40 uppercase tracking-wide mb-3">Recently stamped</p>
            <ul className="list-none space-y-3">
              {ticker.map((entry, i) => (
                <li key={i} className="font-mono text-s-minus-1 text-page/70 leading-relaxed">
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
