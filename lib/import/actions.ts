"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { callModel } from "@/lib/ai/call-model";
import { checkRateLimit } from "@/lib/rate-limit";

export type SegmentResult = { error?: string; items?: string[] };

// §13.2 smart paste, step 1: propose candidate items from free-form text.
// Never writes anything — the result is always shown as an editable
// preview (app/list/import-paste.tsx) before the user commits any of it
// via commitImportedItems below. The pasted text goes to callModel exactly
// as typed, nothing else — same §14.1 contract as every other AI call.
export async function segmentPastedText(text: string): Promise<SegmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = z.string().trim().min(3).max(4000).safeParse(text);
  if (!parsed.success) return { error: "Paste a bit more text." };

  const rateLimitResult = await checkRateLimit("segmentPerHour", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "Too many attempts this hour — try again later." };
  }

  try {
    const result = await callModel({ task: "segment", text: parsed.data });
    if (result.task !== "segment") throw new Error("Unexpected callModel result shape.");
    if (result.items.length === 0) {
      return { error: "Couldn't find separate items in that — try adding line breaks." };
    }
    return { items: result.items };
  } catch {
    return { error: "Smart paste isn't available right now — try the plain 'write your own' field instead." };
  }
}

const importItemSchema = z.object({
  title: z.string().trim().min(1).max(140),
  category: z.string().min(1),
});

export type CommitImportResult = { error?: string; added?: number };

// §13.2 step 2, and also CSV/Excel import's only step (no LLM involved
// there at all — see app/list/import-csv.tsx, which parses the file
// entirely client-side and calls straight into this). Every item lands as
// visibility='private', review_state='draft' — identical to a manual
// single add via addCustomItem. Import never auto-publishes anything.
export async function commitImportedItems(items: { title: string; category: string }[]): Promise<CommitImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  if (items.length === 0) return { error: "Nothing to add." };
  if (items.length > 50) return { error: "That's a lot at once — try 50 or fewer per batch." };

  const parsed = z.array(importItemSchema).safeParse(items);
  if (!parsed.success) return { error: "Some of those items look invalid." };

  const rateLimitResult = await checkRateLimit("bulkImportPerHour", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "Too many imports this hour — try again later." };
  }

  const { error } = await supabase.from("list_items").insert(
    parsed.data.map((item) => ({
      owner_id: user.id,
      custom_title: item.title,
      category: item.category,
      visibility: "private" as const,
      review_state: "draft" as const,
    }))
  );

  if (error) return { error: "Couldn't import those. Try again." };

  revalidatePath("/list");
  return { added: parsed.data.length };
}
