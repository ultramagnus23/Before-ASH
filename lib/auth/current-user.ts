import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/*
 * The signed-in user, fetched at most ONCE per request.
 *
 * `supabase.auth.getUser()` is not a local JWT decode — that is the whole
 * point of it over `getSession()`. It is an HTTP round trip to Supabase Auth,
 * and from bom1 that crosses to ap-southeast-1. PERF-BASELINE.md §6 found 48
 * call sites and, on a single signed-in /list render, the same user being
 * fetched twice before any page data was requested at all.
 *
 * React's `cache()` is per-request, not global: two different people's
 * requests never share a result, and the value does not survive into the
 * next request. That is exactly the lifetime a session lookup wants.
 *
 * Verification of the round trip itself is unchanged — `getUser()` still
 * validates the token against Supabase rather than trusting the cookie. This
 * de-duplicates that check within one render; it does not weaken it.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The id alone, for the many callers that need nothing else. */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const user = await getCurrentUser();
  return user?.id ?? null;
});
