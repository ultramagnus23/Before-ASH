export const metadata = { title: "Privacy — Before ASH" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen max-w-[64ch] mx-auto px-4 py-16 text-ink bg-page">
      <h1 className="font-display font-extrabold text-s-3 mb-2">Privacy</h1>
      <p className="font-mono text-s-minus-1 text-ink-faint mb-8">Last updated: 22 August 2026</p>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">What we collect, and why</h2>
        <p className="text-ink-mid mb-3">
          Your Ashoka email, used only to sign you in — never shown, never sold, never used for anything else.
          Your handle and, if you turn it on, a short bio. The things on your list, their visibility, and what
          you write about them. A record of who you&apos;ve connected with, if you use that feature. Basic usage
          events (see the table below) so we can tell if the product is actually being used.
        </p>
        <p className="text-ink-mid">
          That&apos;s the whole list. No ads, no third-party analytics, no cross-site tracking, no data broker gets
          any of this. We don&apos;t sell your data because there&apos;s no monetisation in this product at all — see the
          Terms page.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Events table (published schema)</h2>
        <p className="text-ink-mid mb-3">
          Our only analytics is a first-party <code>events</code> table: a user id (or nothing, for anonymous
          actions), an event name (e.g. <code>item_added</code>, <code>item_stamped</code>), a small JSON
          payload, and a timestamp. That&apos;s the entire schema. No IP addresses, no device fingerprinting, no
          third party ever receives this data.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Your rights (DPDP Act, 2023)</h2>
        <p className="text-ink-mid mb-3">
          Before ASH is built for students in India and treats the Digital Personal Data Protection Act, 2023
          as the floor, not a formality:
        </p>
        <ul className="list-disc pl-5 text-ink-mid space-y-1.5">
          <li><strong>Access:</strong> request an export of everything we hold about you from Settings.</li>
          <li><strong>Correction:</strong> edit your handle and bio directly, any time, in Settings.</li>
          <li><strong>Erasure:</strong> Delete my account (Settings) hard-deletes your account and everything
            in it, with a 30-day window to change your mind before it&apos;s permanent.</li>
          <li><strong>Grievance:</strong> see the Grievance page for how to reach us and how long we take to
            respond.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">If something goes wrong</h2>
        <p className="text-ink-mid">
          If we ever have a data breach that affects you, we&apos;ll tell you within 72 hours of finding out what
          happened, what was exposed, and what we&apos;re doing about it. Not a vague notice — the actual facts.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">Anonymous posting</h2>
        <p className="text-ink-mid">
          An anonymous item strips your handle and account id from the database response entirely — not
          hashed, not stored alongside it, absent. The one exception: a solo moderator can unmask an anonymous
          post&apos;s author, but only with a written reason of real substance, and every single reveal is logged
          permanently in a record nobody — including us — can edit or delete after the fact. See the Grievance
          page for what triggers that.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-s-1 mb-2">What happens if this shuts down</h2>
        <p className="text-ink-mid mb-3">
          If Before ASH has no active maintainer for 6 months, or the person running it graduates without a
          successor, the product shuts down with 30 days&apos; notice, and all user data is deleted — not sold, not
          transferred, not archived somewhere quietly.
        </p>
        <p className="text-ink-mid">
          If a successor does take over (a campus club, the next class), that&apos;s a material change and you&apos;ll
          be asked to accept updated terms before your next action on the product — you&apos;re never silently
          handed to a new operator.
        </p>
        <p className="text-ink-mid mt-3">
          Separately: if you haven&apos;t logged in for 18 months, your bio and connection history get purged
          automatically. Your list completions are kept only as anonymous, aggregate counts — never tied back
          to your account.
        </p>
      </section>

      <section>
        <h2 className="font-display font-semibold text-s-1 mb-2">Where your data lives</h2>
        <p className="text-ink-mid">
          Supabase (Postgres), rate limiting via Upstash Redis, and an open-source language model we host and
          control ourselves — never Anthropic, OpenAI, or any other closed-model API. When the moderation
          system or search needs to process text, only the bare text itself is sent — never your name, your
          handle, your account id, or anything that could tie it back to you.
        </p>
      </section>
    </main>
  );
}
