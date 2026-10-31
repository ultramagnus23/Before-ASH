import { getOverview } from "@/lib/queries/oversight";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — Before ASH" };

function Stat({ label, value, note, warn }: { label: string; value: string | number; note?: string; warn?: boolean }) {
  return (
    <div className="border border-rule px-4 py-3">
      <dt className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide">{label}</dt>
      <dd className={`font-display font-extrabold text-s-3 leading-tight ${warn ? "text-error" : ""}`}>{value}</dd>
      {note && <p className="text-ink-faint text-s-minus-1">{note}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display font-semibold text-s-1 mb-3">{title}</h2>
      <dl className="grid grid-cols-2 lg:grid-cols-3 gap-3">{children}</dl>
    </section>
  );
}

export default async function OverviewPage() {
  const o = await getOverview();
  const backlog = o.review.awaitingHuman + o.review.held + o.review.flagged;

  return (
    <main className="max-w-[72ch] mx-auto">
      <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">Overview</h1>
      <p className="text-ink-mid mb-8 max-w-[56ch]">
        Counts only. No emails, no list text, no anonymous authors. Generated{" "}
        {new Date(o.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.
      </p>

      <Section title="Community">
        <Stat label="Members" value={o.members} />
        <Stat label="New, 7 days" value={o.newMembers7d} />
        <Stat label="New, 30 days" value={o.newMembers30d} />
        <Stat label="Active, 7 days" value={o.activeUsers7d} note="members with any activity" />
        <Stat label="List items" value={o.listItems} />
        <Stat label="Completed" value={o.stamped} />
      </Section>

      <Section title="Moderation">
        <Stat label="Review backlog" value={backlog} warn={backlog > 0 && (o.review.oldestWaitingDays ?? 0) >= 2} />
        <Stat label="Awaiting human" value={o.review.awaitingHuman} note="anonymous posts" />
        <Stat label="Held" value={o.review.held} note="pulled from public view" />
        <Stat label="Flagged" value={o.review.flagged} note="reported, still visible" />
        <Stat
          label="Oldest waiting"
          value={o.review.oldestWaitingDays === null ? "none" : `${o.review.oldestWaitingDays}d`}
          note="policy: 48h typical, 5 days max"
          warn={(o.review.oldestWaitingDays ?? 0) >= 5}
        />
        <Stat label="Moderator actions, 7d" value={o.safety.modActions7d} />
      </Section>

      <Section title="Safety and privacy">
        <Stat label="Reports, 7 days" value={o.safety.reports7d} />
        <Stat label="Reports, all time" value={o.safety.reportsTotal} />
        <Stat label="Blocks" value={o.safety.blocks} />
        <Stat label="Identity reveals" value={o.safety.reveals} note="each one is in the audit log" />
        <Stat label="Pending deletions" value={o.safety.pendingDeletions} note="30-day recovery window" />
      </Section>

      <Section title="System">
        <Stat label="Server errors, 24h" value={o.system.errors24h} warn={o.system.errors24h > 0} />
        <Stat label="Server errors, 7d" value={o.system.errors7d} />
      </Section>
    </main>
  );
}
