"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setMessage(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 1900);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`fixed left-1/2 bottom-6 z-50 -translate-x-1/2 bg-page text-ink px-4 py-2.5 font-mono text-s-minus-1 tracking-wide shadow-[0_10px_30px_-12px_oklch(0.128_0.03_258/0.7)] transition-transform duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)] ${
          message ? "translate-y-0" : "translate-y-[140%]"
        }`}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
