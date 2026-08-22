export const metadata = { title: "Terms — Before ASH" };

export default function TermsPage() {
  return (
    <main className="min-h-screen max-w-[64ch] mx-auto px-4 py-16 text-ink bg-page">
      <h1 className="font-display font-extrabold text-s-3 mb-2">Terms</h1>
      <p className="font-mono text-s-minus-1 text-ink-faint mb-8">Last updated: 22 August 2026</p>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Who this is for</h2>
        <p className="text-ink-mid">
          Before ASH is for people with an @ashoka.edu.in email address. That's the only requirement. No age
          gate beyond what being enrolled already implies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Free, forever</h2>
        <p className="text-ink-mid">
          No subscriptions, no paywalls, no ads, no "premium" tier, no in-app purchases. There is no
          monetisation code anywhere in this product, and there won't be. If that ever changes, it would be a
          different product — this one stays free.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">What you can post</h2>
        <p className="text-ink-mid mb-3">
          Anything that isn't harassment, doesn't name a specific person in a way that could expose or target
          them, isn't sexual content involving anyone underage or non-consenting, isn't a real threat or
          incitement to something illegal or dangerous, and isn't discriminatory. Everything public goes
          through an automatic check before anyone else sees it; anonymous posts also go through a human check.
          See Grievance for how that works and what to do if you disagree with a decision.
        </p>
        <p className="text-ink-mid">
          Custom items you write are yours to write in any language or mix of languages — Hinglish and
          transliteration are treated as normal, not flagged just for not being pure English.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Anonymous posting has limits</h2>
        <p className="text-ink-mid">
          You need an account at least 7 days old with one completed named item before anonymous posting
          unlocks. One anonymous post per week. If the sitewide anonymous queue backs up, anonymous posting
          pauses for everyone until it clears — this isn't personal, it's how a single-moderator system stays
          honest instead of rubber-stamping a backlog.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Blocking and reporting</h2>
        <p className="text-ink-mid">
          Block anyone, any time, no explanation needed — it's immediate and reversible. Reports go through a
          weighted check before anything gets auto-hidden, so a small group can't silence someone they just
          dislike; a hidden post's author can always appeal.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Your account, your data</h2>
        <p className="text-ink-mid">
          Deleting your account is permanent after a 30-day window — see the Privacy page for exactly what
          that means and what rights you have before then.
        </p>
      </section>

      <section>
        <h2 className="font-display font-semibold text-s-1 mb-2">Changes to these terms</h2>
        <p className="text-ink-mid">
          If we materially change these terms, you'll be asked to accept the new version before your next
          write action on the product — never silently opted in.
        </p>
      </section>
    </main>
  );
}
