import { getAuditTrail } from "@/lib/queries/oversight";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log — Before ASH" };

export default async function AuditPage() {
  const rows = await getAuditTrail(150);

  return (
    <main className="max-w-[96ch] mx-auto">
      <h1 className="font-display font-extrabold text-s-3 leading-[1.02] tracking-[-0.02em] mb-1">Audit log</h1>
      <p className="text-ink-mid mb-8 max-w-[60ch]">
        Every moderation action and every identity reveal, newest first. The log is append-only. For reveals
        you can see who did it and the written reason, never who was revealed.
      </p>

      {rows.length === 0 ? (
        <p className="text-ink-mid">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-s-minus-1">
            <thead className="font-mono text-ink-faint uppercase tracking-wide">
              <tr className="border-b border-rule">
                <th className="py-2 pr-4">When (IST)</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-rule-fine align-top">
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">
                    {new Date(r.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="py-2 pr-4 font-mono">{r.actor}</td>
                  <td className={`py-2 pr-4 font-mono ${r.source === "identity_reveal" ? "text-error" : ""}`}>{r.action}</td>
                  <td className="py-2 pr-4 font-mono text-ink-mid">{r.target}</td>
                  <td className="py-2 text-ink-mid">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
