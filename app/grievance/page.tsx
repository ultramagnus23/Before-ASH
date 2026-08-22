export const metadata = { title: "Community rules — Before ASH" };

export default function GrievancePage() {
  return (
    <main className="min-h-screen max-w-[64ch] mx-auto px-4 py-16 text-ink bg-page">
      <h1 className="font-display font-extrabold text-s-3 mb-2">Community rules and grievances</h1>
      <p className="font-mono text-s-minus-1 text-ink-faint mb-8">Last updated: 22 August 2026</p>

      <div className="border border-stamp-vermilion/40 p-4 mb-8 font-mono text-s-minus-1 text-ink-mid">
        TODO before launch: replace the bracketed placeholder below with a
        real name and a monitored contact. A DPDP-compliant grievance
        process requires a real, reachable person — this can't ship as a
        placeholder.
      </div>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">The two questions every review answers</h2>
        <p className="text-ink-mid mb-3">Whether it's an automatic check or a human one, every review is answering:</p>
        <ol className="list-decimal pl-5 text-ink-mid space-y-1.5">
          <li>Does this break a rule?</li>
          <li>Could three people on this campus work out who wrote it? If yes for an anonymous post, it gets
            rejected with a note on what to change — not published as-is.</li>
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">How review actually works</h2>
        <p className="text-ink-mid mb-3">
          Named posts pass an automatic check (a filter for the obvious stuff, then a language-model
          classifier) before anyone but you sees them — usually instant. Anonymous posts additionally need a
          human to read them, because a person deserves a second look before something with no name attached
          goes out under the campus's account. That takes up to 48 hours in the ordinary case; if it's taking
          longer than 5 days, we'll tell you and offer to publish it under your name instead, but it never
          gets auto-approved just because time passed.
        </p>
        <p className="text-ink-mid">
          There's exactly one moderator right now. If the anonymous queue is backed up, anonymous posting
          pauses sitewide until it clears — named posting is unaffected either way.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">If your post gets hidden or rejected</h2>
        <p className="text-ink-mid mb-3">
          A rejected post stays private to you with a stated reason. A post that gets auto-hidden after
          reports is reversible — it goes to the same queue as anything else waiting on review, and you can
          file one free-text appeal that jumps it to the front of that queue. We'll never tell you who
          reported you.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Identity reveal</h2>
        <p className="text-ink-mid">
          An anonymous post's author can only be unmasked by the moderator, only with a written reason of real
          substance (not a one-line justification), and every reveal is permanently logged in a record that
          cannot be edited or deleted afterward, by anyone, including us.
        </p>
      </section>

      <section>
        <h2 className="font-display font-semibold text-s-1 mb-2">Contact</h2>
        <p className="text-ink-mid mb-2">
          Grievance officer: <strong>[YOUR NAME HERE]</strong>, reachable at{" "}
          <strong>[YOUR CONTACT EMAIL HERE]</strong>.
        </p>
        <p className="text-ink-mid">
          Response time: within 5 working days. If you don't hear back in that window, something's gone
          wrong on our end — try again, it isn't being ignored on purpose.
        </p>
      </section>
    </main>
  );
}
