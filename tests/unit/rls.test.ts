import "../../env";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/*
 * Proves the non-negotiable in BUILD-PROMPT.md #1: a private list_item is
 * unreachable by any other authenticated user, at the RLS layer itself
 * (not just in application code). Requires a real Supabase project with
 * db/migrations/0001_rls.sql already applied — point DATABASE_URL /
 * NEXT_PUBLIC_SUPABASE_URL at a dev or test project, never production.
 *
 * Two throwaway users are created via the admin API, signed in with a
 * password (test-only — the app itself never exposes password auth, only
 * magic link), and torn down after the run.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const canRun = Boolean(url && serviceRoleKey && anonKey);

describe.skipIf(!canRun)("RLS: private list_items are cross-user unreadable", () => {
  const admin = canRun ? createClient(url!, serviceRoleKey!) : null;
  let ownerId: string;
  let otherId: string;
  let ownerClient: ReturnType<typeof createClient>;
  let otherClient: ReturnType<typeof createClient>;
  let privateItemId: string;

  const ownerEmail = `test-owner-${Date.now()}@ashoka.edu.in`;
  const otherEmail = `test-other-${Date.now()}@ashoka.edu.in`;
  const password = crypto.randomUUID();

  beforeAll(async () => {
    const { data: ownerUser, error: ownerErr } = await admin!.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    if (ownerErr) throw ownerErr;
    ownerId = ownerUser.user.id;

    const { data: otherUser, error: otherErr } = await admin!.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });
    if (otherErr) throw otherErr;
    otherId = otherUser.user.id;

    await admin!.from("profiles").insert([
      { id: ownerId, handle: `owner_${ownerId.slice(0, 8)}`, avatar_seed: ownerId },
      { id: otherId, handle: `other_${otherId.slice(0, 8)}`, avatar_seed: otherId },
    ]);

    ownerClient = createClient(url!, anonKey!);
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });

    otherClient = createClient(url!, anonKey!);
    await otherClient.auth.signInWithPassword({ email: otherEmail, password });

    // No generated Database type exists yet (would come from
    // `supabase gen types typescript`, which needs a live project) — the
    // untyped supabase-js client resolves .insert()'s row type to `never`
    // rather than `any` in this version, so this cast is a real, narrow
    // type-only workaround, not a runtime behavior change. Fix properly by
    // generating and wiring in real Database types once a project exists.
    const { data: item, error: itemErr } = await ownerClient
      .from("list_items")
      .insert({
        owner_id: ownerId,
        custom_title: "A private thing only the owner should ever see",
        category: "solitude",
        visibility: "private",
        review_state: "approved",
      } as never)
      .select("id")
      .single();
    if (itemErr) throw itemErr;
    privateItemId = (item as { id: string }).id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("list_items").delete().eq("id", privateItemId);
    await admin.from("profiles").delete().in("id", [ownerId, otherId]);
    await admin.auth.admin.deleteUser(ownerId);
    await admin.auth.admin.deleteUser(otherId);
  });

  it("lets the owner read their own private item", async () => {
    const { data, error } = await ownerClient
      .from("list_items")
      .select("id")
      .eq("id", privateItemId)
      .maybeSingle();
    expect(error).toBeNull();
    expect((data as { id: string } | null)?.id).toBe(privateItemId);
  });

  it("returns nothing to a different authenticated user querying the same id directly", async () => {
    const { data, error } = await otherClient
      .from("list_items")
      .select("id")
      .eq("id", privateItemId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("excludes the private item from another user's unfiltered list scan", async () => {
    const { data, error } = await otherClient.from("list_items").select("id");
    expect(error).toBeNull();
    expect((data as { id: string }[] | null)?.some((row) => row.id === privateItemId)).toBe(false);
  });
});
