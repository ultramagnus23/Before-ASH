"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth/actions";

type CredentialResponse = { credential: string };
type GoogleId = {
  initialize: (config: {
    client_id: string;
    callback: (r: CredentialResponse) => void;
    hd?: string;
    auto_select?: boolean;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, string | number>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function CoverForm({ allowedDomain, next }: { allowedDomain: string; next?: string }) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The Google callback is registered once; read the live checkbox via a ref.
  const consentRef = useRef(false);
  consentRef.current = consent;

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        hd: allowedDomain,
        callback: async ({ credential }) => {
          if (!consentRef.current) {
            setError("Tick the box above first, then sign in.");
            return;
          }
          setBusy(true);
          setError(null);
          const result = await signInWithGoogle(credential, true);
          if (result.error || !result.redirectTo) {
            setBusy(false);
            setError(result.error ?? "Couldn't sign you in.");
            return;
          }
          const dest = result.redirectTo === "/list" && next?.startsWith("/") ? next : result.redirectTo;
          router.push(dest as never);
          router.refresh();
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "filled_blue",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 280,
      });
    };
    if (window.google) return init();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [allowedDomain, next, router]);

  return (
    <div>
      <label className="flex items-start gap-2 mb-5 text-page/60 text-s-minus-1 font-mono">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I&apos;ve read the <a href="/terms" className="underline">Terms</a>,{" "}
          <a href="/privacy" className="underline">Privacy</a>, and{" "}
          <a href="/grievance" className="underline">Community rules</a>.
        </span>
      </label>

      {CLIENT_ID ? (
        <div
          ref={buttonRef}
          aria-busy={busy}
          className={`min-h-[44px] transition-opacity ${consent && !busy ? "" : "opacity-40"}`}
          // Sign-in needs consent; a click on the dimmed button just shows the hint.
          onClickCapture={(e) => {
            if (!consent) {
              e.stopPropagation();
              setError("Tick the box above first, then sign in.");
            }
          }}
        />
      ) : (
        <p className="font-mono text-s-minus-1 text-error-on-dark">
          Sign-in isn&apos;t configured (missing NEXT_PUBLIC_GOOGLE_CLIENT_ID).
        </p>
      )}

      {busy && <p className="font-mono text-s-minus-1 text-page/70 mt-3">Signing you in…</p>}
      {error && <p className="text-error-on-dark text-s-minus-1 mt-3">{error}</p>}

      <p className="font-mono text-s-minus-1 text-page/60 mt-4">
        Sign in with your @{allowedDomain} Google account. No password, no email to check.
      </p>
    </div>
  );
}
