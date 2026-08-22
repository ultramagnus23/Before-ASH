import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";

/*
 * BUILD-PROMPT.md P7: axe-core in CI on the four core routes, REPORT-ONLY
 * initially — promoted to a blocking (test.expect(violations).toEqual([]))
 * check once the passport palette's gold-on-navy text passes WCAG AA
 * contrast (§11). Flipping that on before the contrast audit happens would
 * just make CI red for a known, already-tracked issue rather than
 * surfacing anything new — so this logs violations to the console instead
 * of failing, on purpose, until that audit is done.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && serviceRoleKey);

const ROUTES = ["/list", "/explore", "/feed", "/admin"];

test.describe("axe-core accessibility scan (report-only, see BUILD-PROMPT.md #22)", () => {
  test.skip(!canRun, "Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a dev/test project.");

  const admin = canRun ? createClient(url!, serviceRoleKey!) : null;
  const email = `e2e-axe-${Date.now()}@ashoka.edu.in`;
  const handle = `e2e_axe_${Date.now()}`;
  let userId: string;

  test.afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  for (const route of ROUTES) {
    test(`scans ${route}`, async ({ page, baseURL }) => {
      if (!userId) {
        const { data: createdUser, error } = await admin!.auth.admin.createUser({ email, email_confirm: true });
        if (error) throw error;
        userId = createdUser.user.id;

        // action_link goes through Supabase's /auth/v1/verify, which
        // redirects admin-generated links with tokens in a URL FRAGMENT —
        // generateLink() doesn't register a PKCE code challenge the way a
        // real signInWithOtp() call does. token_hash + verifyOtp (via
        // app/auth/confirm/route.ts) sidesteps that hop; same fix as
        // add-to-list.spec.ts and mark-done.spec.ts — see README.md's
        // "First real e2e run" section for the full story.
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

      // /admin will redirect to /admin/enroll for this fresh test account,
      // which is fine — that redirected page is still worth scanning, it's
      // one of the four core routes' actual rendered surface for most users
      // who aren't admins.
      await page.goto(`${baseURL}${route}`);

      const results = await new AxeBuilder({ page }).analyze();

      if (results.violations.length > 0) {
        console.log(`\naxe-core violations on ${route}:`);
        for (const violation of results.violations) {
          console.log(`  [${violation.impact}] ${violation.id}: ${violation.description} (${violation.nodes.length} node(s))`);
        }
      } else {
        console.log(`\naxe-core: no violations on ${route}.`);
      }

      // Intentionally no assertion here — report-only, see the file
      // comment. When BUILD-PROMPT.md #22's contrast fix lands, change
      // this to: expect(results.violations).toEqual([]);
    });
  }
});
