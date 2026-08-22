import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/*
 * Mark-done (the stamp) is the other path that may never break, alongside
 * add-to-list — BUILD-PROMPT.md #20. This drives the actual press-and-hold
 * gesture with real mouse down/up timing rather than a single click, since
 * a plain click must NOT stamp anything — that's the whole point of the
 * interaction requiring deliberate friction. Same self-contained
 * create/teardown pattern as add-to-list.spec.ts; needs a dev/test
 * Supabase project, never production.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && serviceRoleKey);

test.describe("mark-done / the stamp (core path, must never break)", () => {
  test.skip(!canRun, "Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a dev/test project.");

  const admin = canRun ? createClient(url!, serviceRoleKey!) : null;
  const email = `e2e-stamp-${Date.now()}@ashoka.edu.in`;
  const handle = `e2e_stamp_${Date.now()}`;
  const itemTitle = `E2E test item ${Date.now()}`;
  let userId: string;

  test.afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("list_items").delete().eq("owner_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  async function signInAndOnboard(page: import("@playwright/test").Page, baseURL: string | undefined) {
    const { data: createdUser, error: createErr } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    userId = createdUser.user.id;

    // action_link goes through Supabase's /auth/v1/verify, which redirects
    // admin-generated links with tokens in a URL FRAGMENT — generateLink()
    // doesn't register a PKCE code challenge the way a real signInWithOtp()
    // call does, so it can never produce the `?code=` flow
    // app/auth/callback/route.ts expects. token_hash + verifyOtp (via
    // app/auth/confirm/route.ts) sidesteps that hop; this is the
    // Supabase-documented way to test this, confirmed against a live
    // project — see README.md's "First real e2e run" section.
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
  }

  test("a single click does NOT stamp; a full press-and-hold does", async ({ page, baseURL }) => {
    await signInAndOnboard(page, baseURL);

    await page.fill('input[name="title"]', itemTitle);
    await page.selectOption('select[name="category"]', "solitude");
    await page.click('button:has-text("Add it")');

    const row = page.getByTestId("list-row").filter({ hasText: itemTitle });
    await expect(row).toBeVisible();
    const mark = row.getByTestId("stamp-mark");

    // A plain click is a fast down+up — well under the 420ms hold
    // threshold — and must NOT stamp the item. This is the accidental-tap
    // guard the whole gesture exists for.
    await mark.click();
    await expect(row).toHaveAttribute("data-done", "false");

    // A real held press: move to the mark, press down, wait past the
    // threshold, then release.
    const box = await mark.boundingBox();
    if (!box) throw new Error("stamp mark not found");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550); // comfortably past HOLD_DURATION_MS (420ms)
    await page.mouse.up();

    await expect(row).toHaveAttribute("data-done", "true", { timeout: 2000 });
    await expect(page.getByRole("status")).toHaveText("Stamped.");

    // The proof field appears and takes focus without the user clicking into it.
    const proofInput = row.getByPlaceholder("how was it");
    await expect(proofInput).toBeFocused({ timeout: 1000 });
    await proofInput.fill("Worked exactly as speced.");
    await proofInput.blur();

    // Reload to confirm the stamp and the proof both persisted server-side,
    // not just in optimistic client state.
    await page.reload();
    const reloadedRow = page.getByTestId("list-row").filter({ hasText: itemTitle });
    await expect(reloadedRow).toHaveAttribute("data-done", "true");
    await expect(reloadedRow.getByPlaceholder("how was it")).toHaveValue("Worked exactly as speced.");

    // Second stamp attempt on an already-done item is inert — no crash, no
    // change, per markDone()'s idempotent `.is('completed_at', null)` guard.
    const secondMark = reloadedRow.getByTestId("stamp-mark");
    await expect(secondMark).toBeDisabled();
  });
});
