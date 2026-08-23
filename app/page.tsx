import { CoverForm } from "./cover-form";
import { getTickerPreview } from "@/lib/queries/ticker";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "ashoka.edu.in";

export default async function CoverPage() {
  const ticker = await getTickerPreview();

  return (
    <main className="cover-shell min-h-screen flex flex-col">
      <div className="guilloche relative w-full max-w-[64ch] mx-auto px-4 py-24">
        <div className="h-px bg-gradient-to-r from-foil to-transparent mb-10" />
        <h1 className="font-display font-extrabold text-[clamp(2.6rem,9vw,4.209rem)] leading-[0.94] tracking-[-0.035em] text-page">
          Things worth doing<span className="block text-foil">before you leave.</span>
        </h1>
        <p className="mt-7 mb-10 max-w-[38ch] text-page/70 text-s-1">
          Pick some. Do them. Stamp them. Everything you finish lands on a page
          other people can copy from.
        </p>
        <CoverForm allowedDomain={ALLOWED_EMAIL_DOMAIN} />

        {ticker.length > 0 && (
          <div className="mt-14 border-t border-foil/20 pt-5" aria-label="Recently stamped">
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
