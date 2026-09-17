import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/*
 * The ONLY writer for the `events` table. Keep this in sync with the
 * schema comment on `events` (db/schema.ts) and the public description on
 * app/privacy/page.tsx: a user id or nothing, an event name, a small JSON
 * payload, a timestamp. Adding a field to `metadata` at a call site is
 * fine; adding a new kind of information (IP, device, precise location,
 * anything not already visible to the user themselves) is not, without
 * updating the privacy page in the same change.
 *
 * `events` has RLS enabled with zero policies for `authenticated`
 * (db/migrations/0001_rls.sql) — a service-role client is the only way to
 * write to it, which is deliberate: no path exists for a client-supplied
 * session to forge an event.
 *
 * Never throws. This is telemetry, not a mutation any user flow depends
 * on — a broken events insert must never surface as a broken add-to-list
 * or stamp, same isolation principle as lib/rate-limit.ts's fail-open path.
 */
export async function logEvent(
  userId: string | null,
  eventName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await createServiceRoleClient()
      .from("events")
      .insert({ user_id: userId, event_name: eventName, metadata: metadata ?? null });
    if (error) console.error(`logEvent(${eventName}) failed:`, error.message);
  } catch (err) {
    console.error(`logEvent(${eventName}) threw:`, (err as Error).message);
  }
}
