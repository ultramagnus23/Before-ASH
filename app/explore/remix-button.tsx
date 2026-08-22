"use client";

import { useState, useTransition } from "react";
import { remixQuest } from "@/lib/remix/actions";
import { addCustomCopy } from "@/lib/list-items/actions";

const INTENSITY_LABEL: Record<1 | 2 | 3, string> = {
  1: "Mild tweak",
  2: "A step up",
  3: "Go big",
};

export function RemixButton({ title, category }: { title: string; category: string }) {
  const [open, setOpen] = useState(false);
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const [variants, setVariants] = useState<string[] | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runRemix() {
    startTransition(async () => {
      setError(null);
      setVariants(null);
      const result = await remixQuest(title, intensity);
      if (result.error) {
        setError(result.error);
        return;
      }
      setVariants(result.variants ?? []);
      setAdded({});
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          runRemix();
        }}
        className="font-mono text-s-minus-2 text-ink-faint underline flex-none"
      >
        Remix
      </button>
    );
  }

  return (
    <div className="w-full basis-full mt-2 border border-rule p-3">
      <div className="flex items-center gap-2 mb-2">
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            onClick={() => {
              setIntensity(level);
              startTransition(() => {
                setVariants(null);
              });
            }}
            aria-pressed={intensity === level}
            className={`font-mono text-s-minus-2 px-2 py-1 border ${
              intensity === level ? "border-ink text-ink" : "border-rule text-ink-faint"
            }`}
          >
            {INTENSITY_LABEL[level]}
          </button>
        ))}
        <button onClick={runRemix} disabled={pending} className="font-mono text-s-minus-2 text-ink-mid underline ml-auto disabled:opacity-50">
          {pending ? "Thinking…" : variants ? "Try again" : "Generate"}
        </button>
      </div>

      {error && <p className="font-mono text-s-minus-2 text-error">{error}</p>}

      {variants && (
        <ul className="list-none">
          {variants.map((variant, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 border-t border-rule-fine">
              <span className="text-s-minus-1 text-ink">{variant}</span>
              <button
                disabled={added[i]}
                onClick={() =>
                  startTransition(async () => {
                    const result = await addCustomCopy(variant, category);
                    if (!result.error) setAdded((prev) => ({ ...prev, [i]: true }));
                  })
                }
                className="font-mono text-s-minus-2 text-ink-faint underline flex-none disabled:opacity-50"
              >
                {added[i] ? "Added." : "Add it"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setOpen(false)} className="font-mono text-s-minus-2 text-ink-faint mt-2">
        Close
      </button>
    </div>
  );
}
