"use client";

import { useRef, useState, useTransition } from "react";
import { segmentPastedText, commitImportedItems } from "@/lib/import/actions";

type PreviewItem = { title: string; category: string; selected: boolean };

// §13.2: both paths — smart paste and CSV/Excel — land here, in the same
// preview-before-commit UI. Neither path auto-commits anything; the user
// sees exactly what will be added and can edit, deselect, or bail before
// a single row touches the database.
export function ImportPanel({ categories }: { categories: { key: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultCategory = categories[0]?.key ?? "campus_ritual";

  function runSegment() {
    startTransition(async () => {
      setError(null);
      const result = await segmentPastedText(pasteText);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview((result.items ?? []).map((title) => ({ title, category: defaultCategory, selected: true })));
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      // Parsed entirely client-side — the file never reaches our server for
      // this path, no LLM involved, per BUILD-PROMPT.md §13.2 ("a
      // structured-data problem, not a language problem").
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError("That file doesn't have any sheets.");
        return;
      }
      const firstSheet = workbook.Sheets[firstSheetName];
      if (!firstSheet) {
        setError("Couldn't read that sheet.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: "" });

      const firstRow = rows[0];
      if (!firstRow) {
        setError("Couldn't find any rows in that file.");
        return;
      }

      const columns = Object.keys(firstRow);
      const titleKey = columns.find((k) => /title|item|name/i.test(k)) ?? columns[0];
      const categoryKey = columns.find((k) => /category/i.test(k));
      if (!titleKey) {
        setError("That file doesn't have any columns.");
        return;
      }

      const items: PreviewItem[] = rows
        .map((row) => ({
          title: String(row[titleKey] ?? "").trim(),
          category: (categoryKey && String(row[categoryKey] ?? "").trim()) || defaultCategory,
          selected: true,
        }))
        .filter((item) => item.title.length > 0)
        .slice(0, 50);

      if (items.length === 0) {
        setError("No usable rows found — make sure there's a title/item/name column.");
        return;
      }
      setPreview(items);
    } catch {
      setError("Couldn't read that file. CSV and .xlsx are supported.");
    }
  }

  function commit() {
    if (!preview) return;
    const selected = preview.filter((item) => item.selected);
    if (selected.length === 0) {
      setError("Nothing selected.");
      return;
    }
    startTransition(async () => {
      const result = await commitImportedItems(selected.map(({ title, category }) => ({ title, category })));
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(result.added ?? selected.length);
      setPreview(null);
      setPasteText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="font-mono text-s-minus-1 text-ink-mid underline mb-6">
        Import from somewhere else
      </button>
    );
  }

  return (
    <div className="border border-rule p-4 mb-8">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide">Import</h2>
        <button onClick={() => setOpen(false)} className="font-mono text-s-minus-2 text-ink-faint">
          Close
        </button>
      </div>

      {done !== null && (
        <p className="font-mono text-s-minus-1 text-ink-mid mb-3">Added {done} item{done === 1 ? "" : "s"}.</p>
      )}

      {!preview && (
        <>
          <div className="flex gap-4 mb-3 font-mono text-s-minus-1">
            <button
              onClick={() => setMode("paste")}
              aria-pressed={mode === "paste"}
              className={mode === "paste" ? "text-ink border-b border-ink" : "text-ink-faint"}
            >
              Paste text
            </button>
            <button
              onClick={() => setMode("file")}
              aria-pressed={mode === "file"}
              className={mode === "file" ? "text-ink border-b border-ink" : "text-ink-faint"}
            >
              CSV / Excel
            </button>
          </div>

          {mode === "paste" ? (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder="Paste your list from Notes, WhatsApp, wherever — one thing per line works best"
                className="w-full border border-rule p-2 text-s-0 mb-2"
              />
              <button
                onClick={runSegment}
                disabled={pending || pasteText.trim().length < 3}
                className="border border-ink px-4 py-2 font-semibold text-s-minus-1 disabled:opacity-50"
              >
                {pending ? "Reading…" : "Find items"}
              </button>
            </>
          ) : (
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFile}
              className="font-mono text-s-minus-1"
            />
          )}
        </>
      )}

      {error && <p className="font-mono text-s-minus-1 text-error mt-2">{error}</p>}

      {preview && (
        <div>
          <p className="font-mono text-s-minus-1 text-ink-faint mb-2">
            {preview.filter((i) => i.selected).length} of {preview.length} selected — review before adding
          </p>
          <ul className="list-none max-h-80 overflow-y-auto mb-3">
            {preview.map((item, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 border-b border-rule-fine">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(e) =>
                    setPreview((prev) => prev!.map((p, pi) => (pi === i ? { ...p, selected: e.target.checked } : p)))
                  }
                />
                <input
                  value={item.title}
                  onChange={(e) =>
                    setPreview((prev) => prev!.map((p, pi) => (pi === i ? { ...p, title: e.target.value } : p)))
                  }
                  className="flex-1 bg-transparent border-b border-transparent focus:border-rule text-s-minus-1"
                />
                <select
                  value={item.category}
                  onChange={(e) =>
                    setPreview((prev) => prev!.map((p, pi) => (pi === i ? { ...p, category: e.target.value } : p)))
                  }
                  aria-label={`Category for "${item.title}"`}
                  className="font-mono text-s-minus-2 border border-rule px-1"
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={commit}
              disabled={pending}
              className="border border-ink px-4 py-2 font-semibold text-s-minus-1 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add selected"}
            </button>
            <button onClick={() => setPreview(null)} className="font-mono text-s-minus-1 text-ink-faint">
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
