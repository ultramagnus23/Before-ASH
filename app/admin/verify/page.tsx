"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function AdminVerifyPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      const totp = data.totp.find((f) => f.status === "verified");
      if (!totp) {
        router.push("/admin/enroll");
        return;
      }
      setFactorId(totp.id);
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

    await fetch("/api/admin/mfa-verified", { method: "POST" });
    router.push("/admin");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleVerify} className="max-w-sm w-full">
        <h1 className="font-display font-extrabold text-s-2 mb-2">Confirm it's you</h1>
        <p className="text-ink-mid text-s-minus-1 mb-6">
          Admin sessions re-verify periodically. Enter the code from your
          authenticator app.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          required
          maxLength={6}
          autoFocus
          className="w-full border border-rule px-3 py-2 font-mono text-s-0 mb-3"
        />
        {error && <p className="text-error-on-dark text-s-minus-1 mb-3">{error}</p>}
        <button type="submit" disabled={pending} className="border border-ink px-5 py-2 font-semibold disabled:opacity-50">
          {pending ? "Verifying…" : "Verify"}
        </button>
      </form>
    </main>
  );
}
