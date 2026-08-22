"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// TOTP enrollment for the /admin MFA gate (BUILD-PROMPT.md #17). This page
// itself has no data worth protecting, so it's fine to run entirely
// client-side against Supabase Auth directly rather than through a server
// action — enroll/verify are Supabase Auth operations, not app mutations.
export default function AdminEnrollPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.mfa.enroll({ factorType: "totp" }).then(({ data, error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setPending(true);
    setError(null);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      setPending(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      setPending(false);
      return;
    }

    // Enrollment's own verify call also elevates the session to aal2, but
    // the guard's freshness cookie still needs setting — reuse the same
    // server action the regular verify page uses.
    await fetch("/api/admin/mfa-verified", { method: "POST" });
    router.push("/admin");
  }

  if (error && !qrCode) {
    return <p className="p-8 font-mono text-s-minus-1 text-error-on-dark">{error}</p>;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <h1 className="font-display font-extrabold text-s-2 mb-2">Set up admin MFA</h1>
        <p className="text-ink-mid text-s-minus-1 mb-6">
          Required for /admin — this account can see the review queue and
          unmask anonymous authors, so it needs more than a password.
        </p>
        {qrCode && (
          <div className="mb-6 bg-white p-4 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="Scan with your authenticator app" width={200} height={200} />
          </div>
        )}
        <form onSubmit={handleVerify}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            required
            maxLength={6}
            className="w-full border border-rule px-3 py-2 font-mono text-s-0 mb-3"
          />
          {error && <p className="text-error-on-dark text-s-minus-1 mb-3">{error}</p>}
          <button type="submit" disabled={pending} className="border border-ink px-5 py-2 font-semibold disabled:opacity-50">
            {pending ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
