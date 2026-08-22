import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/*
 * Add-to-list is the one path that may never break — a prior competitor
 * (Bucket, see BUILD-PROMPT.md §4) lost its entire first cohort when a user
 * tried this exact action ~60 times and gave up. This test is meant to be a
 * merge-blocking CI gate, not a nice-to-have.
 *
 * Auth is completed via a real Supabase-generated magic link (admin
 * `generateLink`), not a mocked session — this exercises the actual
 * /auth/callback route, not a shortcut around it. Requires a dev/test
 * Supabase project with all migrations applied; NEVER point this at
 * production, since it creates and deletes a real auth user per run.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && serviceRoleKey);

test.describe("add-to-list (core path, must never break)", () => {
  test.skip(!canRun, "Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a dev/test project.");

  const admin = canRun ? createClient(url!, serviceRoleKey!) : null;
  const email = `e2e-${Date.now()}@ashoka.edu.in`;
  const handle = `e2e_${Date.now()}`;
  let userId: string;

  test.afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  test("a signed-in user can add a catalog item and see it land on /list", async ({ page, baseURL }) => {
    const { data: createdUser, error: createErr } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    userId = createdUser.user.id;

    // Navigating straight to `action_link` doesn't work here: that URL
    // goes through Supabase's own /auth/v1/verify, which redirects with
    // tokens in a URL FRAGMENT (#access_token=...) for admin-generated
    // links — generateLink() doesn't participate in the PKCE code-challenge
    // registration a real signInWithOtp() call makes, so it can't produce
    // the `?code=` flow app/auth/callback/route.ts expects. Confirmed by
    // tracing the actual redirect chain against a live project (see
    // README.md's "First real e2e run" for the story), not assumed.
    // `token_hash` + app/auth/confirm/route.ts (verifyOtp) sidesteps that
    // hop entirely and is the Supabase-documented way to test this.
    const { data: linkData, error: linkErr } = await admin!.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw linkErr;

    await page.goto(`${baseURL}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`);
    await page.waitForURL("**/onboarding/handle", { timeout: 15_000 });

    await page.fill('input[name="handle"]', handle);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/list", { timeout: 15_000 });

    await page.goto(`${baseURL}/explore`);
    const firstRow = page.locator("li", { has: page.getByRole("button", { name: "Add it" }) }).first();
    const questTitle = await firstRow.locator("h4").textContent();

    await firstRow.getByRole("button", { name: "Add it" }).click();
    // Optimistic: flips to "Added." immediately, before any network round trip resolves.
    await expect(firstRow.getByText("Added.")).toBeVisible({ timeout: 1000 });

    await page.goto(`${baseURL}/list`);
    await expect(page.getByTestId("list-row").filter({ hasText: questTitle ?? "" })).toBeVisible();
  });
});
