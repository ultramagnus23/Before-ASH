"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { callModel } from "@/lib/ai/call-model";
import { getCachedRemix, setCachedRemix } from "@/lib/ai/remix-cache";
import { checkRateLimit } from "@/lib/rate-limit";

const intensitySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export type RemixResult = { error?: string; variants?: string[]; cached?: boolean };

// 3 variants, intensity selector, 5/day quota, 24h shared cache — the exact
// numbers from BUILD-PROMPT.md P7. Quota is checked BEFORE the cache read
// so a cache hit still counts against the day's 5 (this is a per-user
// creative-writing budget, not a compute-cost budget — the point is
// limiting how often any one person leans on the feature, not just
// limiting model spend).
export async function remixQuest(text: string, intensity: 1 | 2 | 3): Promise<RemixResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsedIntensity = intensitySchema.safeParse(intensity);
  const parsedText = z.string().trim().min(3).max(140).safeParse(text);
  if (!parsedIntensity.success || !parsedText.success) {
    return { error: "Invalid remix request." };
  }

  const rateLimitResult = await checkRateLimit("remixPerDay", user.id);
  if (!rateLimitResult.allowed) {
    return { error: "5 remixes a day — try again tomorrow." };
  }

  const cached = await getCachedRemix(parsedText.data, parsedIntensity.data);
  if (cached) {
    return { variants: cached, cached: true };
  }

  try {
    const result = await callModel({ task: "remix", text: parsedText.data, intensity: parsedIntensity.data });
    if (result.task !== "remix") throw new Error("Unexpected callModel result shape.");
    await setCachedRemix(parsedText.data, parsedIntensity.data, result.variants);
    return { variants: result.variants };
  } catch {
    return { error: "Remix isn't available right now." };
  }
}
