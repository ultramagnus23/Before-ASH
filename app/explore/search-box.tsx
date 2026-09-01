"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const DEBOUNCE_MS = 350;

// Was "Search, or describe what you're after", which invited the
// whole-sentence queries only the semantic path could serve — and that
// path is unreachable in production (LLM_API_URL points at a local Ollama
// Vercel can't resolve), so those queries fell through to keyword
// matching and returned little. See the note in page.tsx.
const SEARCH_PLACEHOLDER = "Search by keyword — chai, delhi, 3am";

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(defaultValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the field in sync if the URL changes from elsewhere (e.g. "Clear
  // everything"), without fighting the user mid-keystroke.
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  function navigate(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("q", next);
    else params.delete("q");
    startTransition(() => router.push(`/explore?${params.toString()}`));
  }

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Debounced instead of search-on-submit-only — results update as you
    // type (a beat after you pause) rather than requiring Enter, which is
    // what made the old box feel like it wasn't doing anything until you
    // pressed a key it was listening for.
    timeoutRef.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        navigate(value);
      }}
      className="mb-4 flex-1"
    >
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={SEARCH_PLACEHOLDER}
        aria-label="Search the index"
        className="w-full border-b border-rule bg-transparent py-2 text-s-0"
      />
    </form>
  );
}
