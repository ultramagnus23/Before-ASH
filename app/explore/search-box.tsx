"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("q") as string;
        const params = new URLSearchParams(searchParams);
        if (value) params.set("q", value);
        else params.delete("q");
        startTransition(() => router.push(`/explore?${params.toString()}`));
      }}
      className="mb-4"
    >
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search, or describe what you're after"
        aria-label="Search the index"
        className="w-full border-b border-rule bg-transparent py-2 text-s-0"
      />
    </form>
  );
}
