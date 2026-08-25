# Before ASH — through P8 (all phases complete)

Read [`BUILD-PROMPT.md`](./BUILD-PROMPT.md) first — it's the full product spec, the
non-negotiables, and the phase plan. This README is just the local setup for
what's been scaffolded so far (P1 foundation, P2 auth, P3 list + catalog).

## What's here

- Next.js 15 App Router scaffold, Tailwind v4 with the passport design
  tokens ported 1:1 from `prototype.html` (`app/globals.css`)
- Drizzle schema (`db/schema.ts`) — every table from the spec, including
  `review_state`, `identity_reveals`, `policy_acceptances`
- Hand-written RLS policies + the `review_queue` view (`db/migrations/0001_rls.sql`)
- `callModel()` (`lib/ai/call-model.ts`) — the only code path allowed to
  talk to an LLM, wired to an open-source model via Ollama, never a
  closed-vendor API, and typed so a user/item identifier can't be passed in
- Seed loader (`scripts/seed.ts`) that loads `seed-quests.json` and batches
  embeddings through `callModel`
- Two test files:
  - `tests/unit/serializers.test.ts` — runs with no external dependencies,
    proves `list_items.note` can't leak into a public response
  - `tests/unit/rls.test.ts` — needs a real (dev/test, never prod) Supabase
    project with the RLS migration applied; proves cross-user private reads
    fail at the database layer

**P2 (auth) is also done:**

- Magic-link auth restricted to `@ashoka.edu.in`, enforced twice — a Zod
  check before the request (`lib/validation.ts`) and a Postgres trigger on
  `auth.users` as defense-in-depth (`db/migrations/0003_auth_domain_restriction.sql`)
  in case the Auth API is ever called directly
- Handle claim with a reserved-word list (`lib/auth/reserved-handles.ts`),
  opt-in bio with server-side URL/@handle stripping (`lib/validation.ts`'s
  `sanitizeBio`), a locally-generated avatar with no third-party avatar
  service (`lib/avatar.ts`)
- `middleware.ts` gates signed-in-only routes and forces onboarding before
  anything else; API routes are excluded and do their own auth
- Blocking consent checkbox on the cover form (`app/cover-form.tsx`),
  enforced server-side too, logged to `policy_acceptances` on first
  callback (`app/auth/callback/route.ts`)
- `DELETE /account` with a 30-day recovery token
  (`app/api/account/delete`, `/recover`) and the actual hard-delete cron
  (`app/api/cron/purge-accounts`, wired via `vercel.json`)
**Known gap, called out in code:** account-deletion recovery links aren't
emailed yet — no transactional email provider is in the stack. The
confirmation screen shows the link directly as a stopgap. Wire up a
provider (e.g. Resend) before this ships for real — see the `TODO(P6/P7)`
in `app/api/account/delete/route.ts`.

**P3 (list + catalog) is also done:**

- `/list` is the real home screen: your own rows, a first-class "write your
  own" form at the top (`app/list/add-custom-form.tsx` — never behind a tab,
  never secondary to the catalog), and the MRZ strip encoding handle/stamped
  count
- `/explore` browses the 491-item catalog with category filters
  (`app/explore/filters.tsx`, plain links so it works with JS off) and
  search (`app/explore/search-box.tsx`) that goes semantic
  (`callModel({task:'embed'})` + pgvector cosine distance,
  `db/migrations/0004_search_functions.sql`) for longer queries and falls
  back to trigram similarity for short ones, or if AI is disabled/failing
- Adding a catalog item is optimistic (`app/explore/add-button.tsx`, React's
  `useOptimistic`) — the button flips to "Added." before the server round
  trip resolves
- `tests/e2e/add-to-list.spec.ts` — the blocking e2e test for add-to-list,
  completing real magic-link auth via Supabase's admin `generateLink` (not
  a mocked session) and verifying the optimistic UI and the eventual
  `/list` state both work

**P4 (the stamp) is also done** — the signature interaction:

- Press-and-hold on the registration mark (`app/list/row.tsx`), 420ms,
  matching `prototype.html`'s exact geometry and timing
  (`app/globals.css`'s `.stamp-mark`/`.stamp-badge` rules) — a plain click
  (fast down+up) does NOT stamp anything, only a sustained hold does,
  verified by `tests/e2e/mark-done.spec.ts`
- Four stamp inks by category group (`lib/stamps.ts`'s `inkForCategory`),
  seeded per-item rotation so the same item always tilts the same way
  (`seedRotationDeg`), a short display code for items with no catalog id
  (`stampCode`)
- Keyboard equivalent: focus the mark, press Enter, confirm the native
  `window.confirm()` dialog — holding a key down has no reliable
  cross-browser/screen-reader semantics, so a hold is substituted with an
  explicit confirmation instead, exactly as the reference prototype does
- Reduced-motion: the scale-pop on the stamp badge's entrance is dropped,
  but the 420ms hold-arc timing is deliberately preserved even under
  `prefers-reduced-motion` (with an `!important` override — the global
  reduced-motion rule in `app/globals.css`'s `@layer base` would otherwise
  win and cut the timing to 150ms, breaking the "how long do I hold this"
  signal) since that timing is functional, not decorative
- Proof field appears and autofocuses on stamp, editable afterward on blur
  (`setProof` in `lib/list-items/actions.ts`)
- `markDone()` is idempotent (`.is('completed_at', null)` guard) — there's
  no "unstamp," matching the reference prototype exactly; once something's
  stamped it stays stamped

`tests/e2e/mark-done.spec.ts` drives a real mouse down/wait/up sequence
(not a single `.click()`, which Playwright would otherwise fire as a fast
down+up under the hold threshold) and explicitly asserts that a plain click
does nothing — the accidental-tap guard is exactly what's under test, not
an incidental detail.

**P5 (feed + social) is also done:**

- **A gap-fill that had to happen first:** nothing before P5 let a user
  actually change an item's visibility, which means `/feed` could never
  have had legitimate content. `app/list/row.tsx` now has a visibility
  select. Setting something to `public`/`anonymous` moves it to
  `review_state='pending_auto'` — it does **not** auto-approve it. The
  three-layer moderation pipeline that would promote it to `approved` is
  P6, so `/feed` will legitimately show nothing in a fresh environment
  until P6 exists. That's the correct fail-closed direction, not a bug.
  `scripts/dev-approve-item.ts` is a dev-only, non-app-code script to
  manually approve one item for local testing in the meantime.
- `/feed` — cursor-paginated (by `completed_at`, RSC first page in
  `app/feed/page.tsx`, "Load more" via a client component calling a `"use
  server"` action), block-filtering and the anonymous-owner-stripping rule
  both enforced by the same RLS + serializer layers already built in P1/P3
- "I'm in" + mutual-consent connections (`lib/connections/actions.ts`,
  `/connections`) — **what's actually revealed by mutual consent got
  clarified during this build**, since the original spec never specified a
  payload: see `BUILD-PROMPT.md` §13.4. Short version — the owner already
  sees who's interested (never hidden), and mutual consent specifically
  gates the interested party learning an **anonymous** owner's handle.
  Revoking resets both sides' acceptance, not just one, so re-expressing
  interest after a revoke can't silently restore a connection the owner
  never re-agreed to.
- `/u/[handle]` — public profile, `visibility='public'` items only, never
  `'anonymous'` ones (an anonymous item must never be attributable to a
  person anywhere, including by showing up on their profile)
- `/q/[slug]` — quest detail page with its own public completions and an
  "Add it" (reuses `app/explore/add-button.tsx`)
- `app/app-nav.tsx` — a shared nav across `/list`, `/explore`, `/feed`,
  `/connections`, since nothing before P5 linked these routes together

**Fully verified now:** `lib/queries/connections.ts`'s `profiles!owner_id(...)`
/ `profiles!interested_id(...)` column-name embed hints were confirmed
against the live Supabase REST API (not just the FK constraints existing
in the schema) once `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
were filled in — a real query through the actual PostgREST layer resolved
both without a schema-cache error. `lib/queries/boards.ts`'s
double-nested `board_items -> item_posts -> profiles!author_id(...)` embed
(a more exotic case than P5's, added in P8) was checked the same way and
also resolves correctly.

**P6 (safety) is also done — the biggest phase so far:**

- **Moderation pipeline** (`lib/moderation/`): deterministic filter (slurs,
  URLs, phone/room-number patterns, repeated chars — blocks outright, no
  model call) then the LLM classifier via `callModel({task:'moderate'})`.
  `setVisibility` in `lib/list-items/actions.ts` now actually runs this —
  going public/anonymous is a real decision, not a guess, and **fails
  closed**: if `AI_ENABLED` is off or the classifier call fails, a named
  item goes to `held` (admin queue) and an anonymous item goes to
  `pending_human`, never to `approved`.
- **Anonymous review, exactly per the solo-moderator rules**
  (`lib/moderation/anonymous-review.ts`): the 7-day/1-named-item
  eligibility gate, the 1/week rate limit, and the 10-pending sitewide
  circuit breaker (checked via the service role, since a regular user's
  RLS-scoped session structurally can't see the sitewide count).
  `ANON_REVIEW_ENABLED=false` hides the anonymous option from `/list`'s
  visibility select entirely, without breaking anything already queued.
- **A real schema decision, not a workaround:** report-abuse mitigations
  (§7.1) need a state that means "still publicly visible, but flagged for
  admin attention" — `held` already means "pulled from view," so a new
  `flagged` enum value was added (`db/migrations/0005_report_abuse_enum.sql`,
  isolated in its own transaction since Postgres won't let a new enum value
  be used in the same transaction that added it — the RLS policy and view
  that reference it live in the next migration). `lib/reports/actions.ts`'s
  `evaluateReportThreshold` computes the actual weighted bar (distinct
  reporters, distinct reasons, account-age spread) after every new report —
  3 reports that look organic auto-hide (`held`); 3 that don't clear the
  bar just `flagged` the item for a look, without pulling it. One free-text
  appeal per item jumps it to the top of the admin queue
  (`appealed_at`, the only queue-priority mechanism in the product).
- **`/admin`** gated on `ADMIN_HANDLES` **and** MFA (`lib/admin/guard.ts`):
  since Supabase's own aal2 session status doesn't expire on a timer, "must
  re-verify if older than a few hours" is enforced with our own freshness
  cookie, set only right after a real `mfa.verify()` call. The
  `review_queue` view itself was hardened this phase too —
  `security_invoker = true` plus an explicit `revoke all ... from
  authenticated` — so a future accidental grant fails closed (a permission
  error) instead of failing open (leaking the entire queue to every
  signed-in user, since the view would otherwise run with its owner's
  RLS-bypass privileges). Review UI is keyboard-driven (A/R/H/I) and reads
  only `text, category, visibility, review_state, account_age_bucket,
  prior_rejection_count` — never `owner_id`, `handle`, or `email`.
  `tests/unit/admin-queue.test.ts` statically checks the view's SQL never
  selects any of those three.
- **Identity reveal** (`revealIdentity` in `lib/admin/actions.ts`) requires
  a written reason of at least 20 characters and writes to
  `identity_reveals`, which has no UPDATE/DELETE grant at the DB level —
  genuinely permanent the moment it's inserted.
- **Report + Block, one tap**, on feed rows (`app/feed/feed-row.tsx`).
  Block deliberately takes a **handle**, never an id
  (`lib/blocks/actions.ts`) — `PublicListItem` never carries `owner_id`,
  and there is no way to block an anonymous item's author, because that
  would require exposing an identity the whole feature is built to hide.
- **Rate limits** (`lib/rate-limit.ts`, Upstash): reports (5/day), anonymous
  posts (1/week), custom-item creation and connection requests (generous
  hourly ceilings). **Deliberately not applied to add-to-list or
  mark-done** — those are the two paths that may never break, and this
  module throws at load time if Upstash isn't configured, so every call
  site that uses it does so via a dynamic `import()` scoped to only the
  function that needs it, keeping that failure mode from taking down
  anything else in the same file.
- **Policy pages have real content now**, not placeholders: `/privacy`
  (DPDP rights, the events-table schema, the 72-hour breach commitment, the
  end-of-life statement), `/terms`, `/grievance` (the two review questions,
  how appeals work, identity-reveal accountability). The grievance page
  still has a `TODO` banner for the actual grievance-officer name/contact —
  that's a real person's information, not something to fabricate.
- **The "no auto-approve on timeout" mechanic**: a `pending_human` item
  past 5 days shows an apology banner on `/list` with a "Convert to named"
  button (`convertToNamed` in `lib/list-items/actions.ts`) — it stays
  pending regardless, this is purely an offer the author can take or leave.

**P7 (AI + polish) is also done:**

- **Remix** (`lib/remix/actions.ts`, `app/explore/remix-button.tsx`): 3
  variants, intensity selector (1-3), 5/day quota, 24h cache shared across
  ALL users (not per-user) keyed on `(text, intensity)` — two people
  remixing the same catalog quest at the same intensity get the same
  cached result instead of paying for two model calls.
- **Weekly featured quest, deliberately NOT a cron job**
  (`lib/queries/featured.ts`): a pure function of the current ISO week
  number picks the same quest for everyone, rotating on its own every
  Monday with no scheduled infrastructure to monitor or fail silently.
  This is a considered simplification, not a shortcut — it does what
  "weekly side-quest cron" needed without a moving part that can break.
- **Cover-page ticker** (`lib/queries/ticker.ts`): the one page a
  logged-out visitor can reach, but every RLS policy in this app is scoped
  `to authenticated`, so a logged-out request gets zero rows from anything.
  Rather than widen RLS to grant `anon` read access — a change to the
  app's core privacy boundary, just for a marketing nicety — this uses the
  service role for one narrow, already-public, read-only query, run
  through the same serializer rules as everywhere else.
- **Loading skeletons**, no spinners (`app/list/loading.tsx`,
  `app/explore/loading.tsx`, `app/feed/loading.tsx`) — static shells
  matching the real layout, so there's no layout shift when content streams in.
- **PWA icon** — an SVG at `public/icons/icon.svg`, referenced from the
  manifest and `app/layout.tsx`. Real gap, flagged in both places: iOS
  home-screen add and some older Android launchers need an actual PNG,
  which no text-based tool can generate. Export a 180×180 and a 512×512
  PNG from that SVG before launch.
- **`tests/e2e/accessibility.spec.ts`** — axe-core against `/list`,
  `/explore`, `/feed`, `/admin`, report-only per spec (logs violations,
  doesn't fail the test) until the contrast audit below is verified live.
- **A real contrast audit, not a claim of one** — computed actual WCAG
  ratios (OKLCH → sRGB → relative luminance, by hand, not eyeballed) for
  every text/background combination in the built app. Found and fixed
  three failures, one of them systemic (`--color-ink-faint` was measuring
  2.92:1 — failing even the 3:1 large-text floor — and it's used
  everywhere: category labels, timestamps, visibility badges). Full
  before/after table in `BUILD-PROMPT.md` §11.1. Two new tokens,
  `--color-error` and `--color-error-on-dark`, replace direct use of the
  brand stamp-ink color for error text, since that color is correct for
  stamp badges (a graphic element) but was failing contrast as text on
  both the light and dark backgrounds it was being used on.
- **Lighthouse targets (LCP/CLS/JS budget) — NOT measured, and I want to
  be explicit about that rather than imply otherwise.** These need an
  actual build + deploy to measure; nothing here fabricates a number. Code
  review pass done instead: no client component imports `@supabase/supabase-js`
  or `@upstash/*` directly (both are server-only-sized dependencies), the
  `/list` client components (`row.tsx`, `toast.tsx`, `add-custom-form.tsx`)
  are all small with no heavy third-party libraries, and fonts already go
  through `next/font` (P1) for automatic fallback-metric matching, which
  is most of what CLS prevention needs. Run a real Lighthouse pass after
  deploying and treat this section as unverified until then.

**P8 (collaboration + import) is done — the last planned phase:**

- **Per-item blog + links** (`lib/item-posts/actions.ts`'s `setBlogPost`,
  `app/list/blog-editor.tsx`): optional, collapsed by default, one write-up
  per personal item (upsert, not a thread). Goes through the full
  moderation pipeline when the parent item is public/anonymous — a blog
  post gets no exemption just because it's "extra" text. Links are capped
  at 5, validated as http/https at the Zod boundary, never fetched
  server-side for previews.
- **Bulk import** (`lib/import/actions.ts`, `app/list/import-panel.tsx`):
  smart-paste via a NEW `callModel` task, `'segment'` — this was speced
  back in P5 but never actually implemented until now, since nothing
  called it yet. CSV/Excel import added the project's only new dependency
  since P1 (`xlsx`, parsed entirely client-side, no LLM, file never
  touches the server for that path). Both paths funnel into the same
  preview-before-commit UI and the same `visibility: 'private'`,
  `review_state: 'draft'` insert that a manual add uses — import has no
  bearing on what becomes public later.
- **Shared boards** (`/boards`, `/boards/[id]`, `lib/boards/actions.ts`,
  `lib/queries/boards.ts`): role-based (owner/editor/contributor/viewer),
  direct invites, and a discoverable "looking for people" join-request
  flow. Completion stays entirely personal — "add to my list" from a board
  item creates a normal `list_items` row via the same
  `addFromCatalog`/`addCustomCopy` actions `/explore` and `/feed` already
  use, so the stamp/mark-done code path is completely untouched by this
  feature, per the original design commitment in `BUILD-PROMPT.md` §13.3.
- **A real gap I caught before merge, not after:** the board-item UI
  initially only let a post's own author delete it, even though the RLS
  policy already correctly allowed an editor/owner to delete anyone's post
  on the board (the "moderate any post" half of the editor role). Fixed —
  see `BUILD-PROMPT.md` §13.5 for the detail.

Every phase from the original build prompt is now built. Remaining work is
verification (the checklists accumulated across each phase's README
section) and the handful of explicitly-flagged gaps: the 12 placeholder
catalog names, real PNG app icons, a transactional email provider, the
grievance-officer contact, and an actual Lighthouse/live-axe-core pass.

## Setup

1. **Copy env and fill it in.** You said Supabase/Vercel accounts already
   exist — pull the values from your Supabase project settings.

   ```bash
   cp .env.example .env.local
   ```

2. **Install dependencies.**

   ```bash
   npm install
   ```

3. **Run Ollama locally** (or point `LLM_API_URL` at whatever inference
   endpoint you're using — see `BUILD-PROMPT.md` §14.1 for the data-boundary
   rule this must satisfy).

   ```bash
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text
   ollama serve
   ```

4. **Generate and apply the schema, then the RLS migration.**

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

   `db:migrate` applies every `.sql` file in `db/migrations` in order,
   starting with `0000_initial_schema.sql` (the actual `CREATE TABLE`
   migration — generated and verified against a real `drizzle-kit` run, see
   "First real `npm install`" below) through the hand-written RLS,
   auth-domain-restriction, search-function, and safety migrations.
   `db:generate` should report "No schema changes, nothing to migrate" if
   `db/schema.ts` hasn't changed since — that's the expected, healthy
   result, not a sign something's broken.

5. **Fill in the 12 placeholder catalog items** in `seed-quests.json` — see
   `BUILD-PROMPT.md` §12.1 for the exact list. The seed loader will run
   without this but prints a loud warning; don't launch with it unresolved.

6. **Seed the catalog.**

   ```bash
   npm run db:seed
   ```

7. **Run unit tests.**

   ```bash
   npm test
   ```

   The RLS test is skipped automatically unless `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` point at
   a real project — point it at a dev/test Supabase project, never
   production, since it creates and deletes real auth users.

8. **Run the app.**

   ```bash
   npm run dev
   ```

9. **Run the e2e test** (needs the dev server + the same dev/test Supabase
   env vars as the RLS test — never production).

   ```bash
   npx playwright install --with-deps chromium
   npm run test:e2e
   ```

## First real migration run against a live Supabase project — what it found

This is the point where "verified offline" (typecheck, `drizzle-kit generate`) turned into "actually ran against a real, stateful Postgres database," and it found four more real bugs — on top of the pgvector-extension-ordering one already caught during the offline `generate` verification. None of these were visible from reading the SQL; every one needed a live database to surface.

- **`db/migrate.ts` had no migration-tracking table.** It re-read and re-ran every `.sql` file on every invocation with no memory of what had already succeeded. Harmless the first time; the moment a later migration fails partway through and you fix it and re-run, it tries to redo everything from `0000` again and immediately fails on a non-idempotent `CREATE TYPE`. Fixed by adding a `_sql_migrations(filename, applied_at)` ledger table that the script checks and updates per file — this is what let a real fix-and-retry cycle work at all. Any hand-rolled migration runner needs this from day one; it's easy to not notice the gap until you actually need to resume after a failure.
- **`0003_auth_domain_restriction.sql` tried `ALTER DATABASE ... SET app.allowed_email_domain`, which Supabase's managed Postgres refuses** ("permission denied to set parameter") even from the `postgres` connection role, which looks superuser-ish but isn't fully on their platform. Confirmed live, not assumed from documentation. Rewrote the migration to hardcode `ashoka.edu.in` directly in the trigger function instead of reading a configurable GUC — the domain changing is rare enough that editing one line of SQL is a fine tradeoff against a privilege problem with no clean workaround on managed Postgres.
- **`0006_safety_p6.sql` used `CREATE OR REPLACE VIEW` to add the new `appealed_at` column in the middle of `review_queue`'s column list** (between `created_at` and `account_age_bucket`, for readability). Postgres only allows `CREATE OR REPLACE VIEW` to append columns at the very end — inserting one in the middle fails with "cannot change name of view column." This view had already been created by `0001_rls.sql` on this same database, which is exactly the condition that exposes the bug — it would never show up generating against an empty schema. Fixed by switching to `DROP VIEW IF EXISTS` + `CREATE VIEW`, which is also more robust for any future column change, not just this one.
- **The most serious one: `identity_reveals`, `reports`, and `moderation_log`'s revoke statements never included `anon`.** `0001_rls.sql` revoked `UPDATE`/`DELETE` from `public`, `authenticated`, and `service_role` — but `REVOKE ... FROM PUBLIC` only affects privileges granted *to* the `PUBLIC` pseudo-role, and Supabase grants table privileges directly to `anon`/`authenticated`/`service_role` on every new table by default. Querying `information_schema.table_privileges` directly against the live database showed `anon` still holding live `UPDATE` and `DELETE` grants on all three append-only/audit tables — including `identity_reveals`, the one non-negotiable #14h specifically requires to have no update/delete permission at the DB level, at all, ever. In practice this wasn't exploitable *today* (RLS has zero policies granting `anon` any access to these tables, so RLS still blocked it) — but `service_role` bypasses RLS entirely by design, which is exactly why revoking from it was already correct; `anon` belongs in the same list on the same defense-in-depth principle, not just where a hole is provably reachable right now. Fixed `0001_rls.sql` for fresh deployments and added `0007_grant_hardening.sql` to close the gap on this already-running database — never rewrite an already-applied migration's history, always fix forward.

**Current live state** (dev Supabase project, verified by direct query, not assumed): 20 tables, all with RLS enabled, all 8 migrations applied in order (`0000` through `0007`), `review_queue` has zero grants to `anon`/`authenticated` and the correct 9-column shape, `identity_reveals`/`reports`/`moderation_log` have zero `UPDATE`/`DELETE` grants to `anon` or `authenticated`, the `review_state` enum includes `flagged`, both search functions and the email-domain trigger exist.

**Update: the anon/service-role keys are filled in now, and the RLS test ran for real.** `.env.local` uses Supabase's newer `sb_publishable_...` / `sb_secret_...` key format (a drop-in replacement for the legacy anon/service_role JWTs — same `createClient(url, key)` usage, no code changes needed). Both keys were verified to actually authenticate against the REST API before trusting them for anything: the service-role client could read `quests` (bypassing RLS, as expected), and the anon client's unauthenticated query returned an empty array with no error (RLS correctly filtering rather than erroring).

With all three Supabase env vars finally present, `tests/unit/rls.test.ts`'s 3 tests ran for the first time ever — not skipped — against the live database: **all 3 passed.** This is the actual, load-bearing verification of the single most important non-negotiable in the whole spec (#1: a private item is unreachable by any other user), confirmed against real RLS enforcement, not inferred from reading the policy SQL. The test's own cleanup was also verified directly afterward: 0 leftover auth users, 0 leftover `list_items` rows.

This also finally resolved the two "unverified" PostgREST embed-hint flags from P5 and P8 (see above) — both confirmed working against the real REST API, not just assumed from the FK constraints existing.

## First real e2e run — what it found

Running `npm run test:e2e` for the first time (against the live dev server, live Supabase project, real browser automation) surfaced the two most consequential bugs of this whole verification pass — both invisible from every check that came before, including the unit-test RLS pass, `typecheck`, and `drizzle-kit generate`.

- **A real, if minor, Next.js version-bump fallout, found in the first few seconds:** `next.config.ts`'s `experimental.typedRoutes` moved out of `experimental` in a minor release after `next` was bumped to `15.5.23` (see "First real npm install" below) — a deprecation warning, not a hard failure, but fixed immediately. An unrelated `package-lock.json` in the user's home directory was also making Next.js infer the wrong workspace root on every dev-server start; pinned `outputFileTracingRoot` explicitly rather than touching a file outside this project.
- **The consequential one: `admin.generateLink()` cannot simulate a real magic-link click for a PKCE-configured app**, and every one of the three e2e specs used it that way. Tracing the actual HTTP redirect chain (not assumed from docs) showed `action_link` goes through Supabase's own `/auth/v1/verify`, which redirects with the session tokens in a URL **fragment** (`#access_token=...`) for admin-generated links — fragments are never sent to a server in an HTTP request, so `app/auth/callback/route.ts` (which only reads a `?code=` query param) would see nothing and immediately bounce to `/?error=missing_code`, before `/onboarding/handle` was ever reached. This happens specifically because `generateLink()` is an admin API call that never registers the PKCE code-challenge a real, client-initiated `signInWithOtp()` call does — it's a known gap in how Supabase's admin API interacts with PKCE-flow apps, not a bug in the production auth code path itself (which may well work correctly for a real user; that still hasn't been verified by actually receiving and clicking a real email, since that requires infrastructure this session doesn't have). **Fixed by adding `app/auth/confirm/route.ts`**, which verifies a link's `token_hash` directly via `supabase.auth.verifyOtp()` — this sidesteps the `/auth/v1/verify` hop entirely and is the Supabase-documented way to test this regardless of which flow production ends up using. All three e2e specs now use `token_hash` + `/auth/confirm` instead of `action_link`. The shared post-auth logic (consent logging, onboarding check, redirect) was factored out into `lib/auth/complete-session.ts` so both `/auth/callback` (PKCE) and `/auth/confirm` (OTP hash) stay in sync.
- **A genuinely embarrassing one, caught only because the dev server was actually running and rendering pages**: `lib/list-items/actions.ts` has `"use server"` at the top, and it exported `STALE_PENDING_DAYS = 5` as a plain constant alongside its async server actions. Next.js enforces, at build time, that a `"use server"` file may **only** export async functions — plain value exports (constants, objects, non-async functions) are a hard error. This broke the dev server outright: every page importing anything from that file (`/list`, `/`, and transitively others) 500'd. `export type` declarations are fine everywhere else (TypeScript types are erased before this check ever applies), which is why an audit of all 15 `"use server"` files found exactly one violation — this one. Fixed by moving the constant to a new `lib/list-items/constants.ts` with no `"use server"` directive.

**How these were found, concretely:** rather than trusting `page.goto(action_link)` to work, the redirect chain was traced with a raw `https.get()` call reading the `Location` header directly — this showed the fragment-based tokens immediately, in a way a Playwright test's opaque timeout never would have explained on its own. The `"use server"` bug was found by watching the dev server's own compiler output after the browser was opened for a completely unrelated reason (showing the running app), not by a targeted test.

## First real `npm install` + `npm test` pass — what it found

Running the actual toolchain for the first time (previously verified only by reading the code) turned up real, fixable problems. Worth recording rather than glossing over:

- **`npm install` surfaced a critical Next.js security advisory chain** — the pinned `15.1.0` had disclosed RCE (via the React Flight protocol), middleware auth bypass, and SSRF vulnerabilities, all patched in `15.5.23`. Bumped `next` and `eslint-config-next` to that version; `npm test` and `npm run typecheck` both still pass clean after the bump.
- **`drizzle-orm`'s SQL-injection advisory (fixed at `0.45.2`) is also resolved now** — bumped it and `drizzle-kit` (to `0.31.10`, a compatible pairing) together. `npm audit` no longer lists `drizzle-orm` at all. Verified two ways, not just by re-running the type checker:
  - `npm run typecheck` passes clean against the new versions — `db/schema.ts`'s `check()`, `pgEnum`, `customType` (the `vector` column), and the array-style `extraConfig` callbacks all still resolve correctly.
  - **`npx drizzle-kit generate` actually ran** (it only introspects the local `schema.ts` — no live database connection needed for `generate`, only for `migrate`/`push`) and produced `db/migrations/0000_initial_schema.sql`, the real `CREATE TABLE` migration that — this is the important part — **never existed before**. Every hand-written migration from P1 onward (`0001_rls.sql` through `0006_safety_p6.sql`) assumed the tables already existed, but nothing had ever actually run `drizzle-kit generate` to produce that foundational file, since there was no way to verify it without `node_modules` installed. All 19 tables, every enum, every FK, every index (including the HNSW vector index) matched what `db/schema.ts` specifies.
  - **That first `generate` run caught a real, previously-invisible bug**: the generated `0000` migration creates `quests.embedding` as a `vector(768)` column, but the `pgvector` extension wasn't created until `0001_rls.sql` — which runs *after* it. On a genuinely fresh database, migration `0000` would have failed outright on its first `CREATE TABLE quests` statement. Fixed by prepending `CREATE EXTENSION IF NOT EXISTS vector;` to `0000_initial_schema.sql` itself (both files' `CREATE EXTENSION` calls are idempotent, so having it in both is harmless, not redundant-in-a-bad-way).
  - Re-ran `generate` a second time after renaming the file and fixing the extension ordering — got "No schema changes, nothing to migrate," confirming `db/migrations/meta/`'s tracking is consistent and the schema is stable under the new versions.
- **Still open, not yet fixed:**
  - `xlsx` (added in P8 for CSV/Excel import) has **no fix available** for a prototype-pollution and ReDoS advisory. Real but lower-severity here: it only ever parses a file the signed-in user chooses to upload, entirely client-side, for their own list — not attacker-controlled server input. Worth watching for a patched release or an alternative library before this becomes a bigger surface.
  - `esbuild`/`vite`/`vitest`'s dev-only chain has a moderate/critical-rated issue that only matters if `vitest --ui` is run with its dev server exposed — not a production runtime risk.
  - `postcss`/`sharp` advisories that only resolve via a Next.js 16 major-version bump — not attempted, too large a jump to verify blind.
- **`npm test` failed on 2 of 8 tests, both my own bugs, not flakiness:**
  - `tests/unit/admin-queue.test.ts` used a regex too blunt to tell "owner_id used internally to JOIN/filter" apart from "owner_id exposed as an output column" — the `review_queue` view legitimately needs the former (to compute `account_age_bucket` and `prior_rejection_count`) and correctly never does the latter, but the original test couldn't distinguish the two and failed on the view's own correct SQL. Rewrote it to strip the known-legitimate join predicate and subquery before checking what's left.
  - `tests/unit/serializers.test.ts` failed to even load: the real `server-only` package throws unconditionally outside Next.js's RSC bundler, which Vitest isn't. Standard fix — aliased `server-only` to an empty stub (`tests/mocks/server-only.ts`) in `vitest.config.ts`'s test-only resolve config; production builds still get the real guard.
- **`npm run typecheck` had never been run before this — it found ~20 real errors**, now all fixed:
  - The most common: `startTransition(() => someServerAction(id))` across a dozen call sites. React 19's stricter types reject a transition callback that returns a non-void value, and an expression-bodied arrow implicitly returns whatever the server action resolves to. Fixed by switching each to a block body (`() => { someServerAction(id); }`), which returns `void`.
  - `app/list/import-panel.tsx`'s CSV/Excel parsing had three real `undefined`-safety gaps (an empty workbook, an empty sheet, a header-less row) that `noUncheckedIndexedAccess` (set in `tsconfig.json` since P1) correctly flagged — added explicit guards with user-facing error messages for each instead of assuming a well-formed file.
  - `lib/import/actions.ts` chained a `{count, head}` option onto `.select()` after `.insert()`, which isn't a valid combination there — simplified to just returning the length of the array being inserted, since that count was already known without asking Supabase to report it back.
  - `lib/supabase/server.ts` and `middleware.ts` had an implicit-`any` cookie-array parameter — added the real `CookieOptions` type from `@supabase/ssr` instead of leaving it untyped.
  - The test files (`rls.test.ts`, `admin-queue.test.ts`) needed a few explicit casts where Supabase's client resolves table row types to `never` without a generated `Database` type (which needs a live project to generate) — narrow, test-only, commented casts, not a runtime behavior change.

None of this changes what the app does — every fix here is either a type-safety correction, a test-precision fix, or a dependency patch. But it's worth being honest that this is the **first time any of this was actually compiled or executed**, and it found real bugs that a read-through didn't catch.

## Before launch (all phases are built — this is the real remaining list)

- [ ] 12 placeholder catalog items filled with real Ashoka names
- [x] ~~RLS test actually run and passing against your dev Supabase project~~
      — done: all 8 migrations (`0000` through `0007`, see "First real
      migration run" above) applied to a real project, `tests/unit/rls.test.ts`'s
      3 tests ran for real (not skipped) and passed, cleanup verified directly.
- [ ] `tests/e2e/add-to-list.spec.ts` AND `tests/e2e/mark-done.spec.ts`
      actually run and passing — both are meant to be merge-blocking CI
      gates, not just files that exist
- [ ] Manually confirm the stamp on a real phone or trackpad, not just the
      e2e test — press-and-hold gestures are exactly the kind of thing
      that feels different on a touchscreen than in an automated mouse
      simulation
- [ ] Confirm the reduced-motion variant looks right (toggle
      `prefers-reduced-motion` in devtools) — the hold should still take
      420ms, the stamp badge just shouldn't bounce in
- [ ] Decide `ANON_REVIEW_ENABLED` for launch week (see `BUILD-PROMPT.md` §17)
- [ ] Confirm Ollama (or your chosen open-source inference endpoint) is
      reachable from wherever this deploys, not just localhost
- [x] ~~Run `alter database ... set app.allowed_email_domain`~~ — no longer
      applicable: confirmed live that Supabase's managed Postgres refuses
      `ALTER DATABASE SET` for custom parameters outright, even from the
      `postgres` role. `0003_auth_domain_restriction.sql` now hardcodes the
      domain directly in the trigger function instead — see "First real
      migration run" below.
- [ ] Full walkthrough: request a link on `/`, click it, claim a handle,
      land on `/list`, add a custom item, add a catalog item from
      `/explore`, confirm both show up on `/list`, set a bio in
      `/settings`, confirm `DELETE /account` issues a recovery link that
      actually cancels deletion when visited
- [ ] Try a long, phrase-like `/explore` search and a short one — confirm
      the semantic path and the trigram fallback both return something
      reasonable (check server logs for which path fired)
- [ ] Pick a transactional email provider before real signups (see the
      known gap above) — magic links work today via Supabase Auth, but
      account-recovery links don't get emailed yet
- [ ] Confirm the `profiles!owner_id` / `profiles!interested_id` PostgREST
      embed hints in `lib/queries/connections.ts` actually resolve against
      your real schema (see the "Unverified" note above) — fix by swapping
      in the real FK constraint name from `db/migrations/` output if not
- [ ] Full P5 walkthrough with two test accounts: set an item to
      `anonymous` on account A, run `npm run dev:approve-item <id>` to
      simulate P6 approving it, confirm it shows up on `/feed` from account
      B with no handle attached, click "I'm in" as B, accept as A from
      `/connections`, confirm B now sees A's handle only after that accept
- [ ] Confirm an item set to `public` shows up on its owner's `/u/[handle]`
      page, and that an `anonymous` item never does
- [ ] Set `UPSTASH_REDIS_REST_URL`/`TOKEN` and confirm `npm run dev` still
      boots and add-to-list/mark-done still work — then unset them
      deliberately and confirm add-to-list/mark-done STILL work (this is
      the isolation the dynamic-import pattern in `lib/list-items/actions.ts`
      is supposed to guarantee — verify it actually does)
- [ ] Set your own handle in `ADMIN_HANDLES`, visit `/admin`, complete MFA
      enrollment, confirm you land on the review queue
- [ ] Set an item to `public` with genuinely borderline text and confirm it
      lands in the admin queue as `held` (0.4-0.7 band) rather than either
      extreme — this is the one path that needs a real Ollama classifier
      running to test meaningfully, not just the deterministic filter
- [ ] File 3 reports on the same item from 3 accounts created around the
      same time with similar reasons — confirm it does NOT auto-hide (fails
      the account-age-spread check) and instead lands as `flagged` (still
      visible) rather than `held`
- [ ] Manually wait out (or fake, via direct DB update) the 5-day
      `pending_human` staleness window and confirm the apology banner and
      "Convert to named" button appear on `/list`
- [ ] Confirm `ANON_REVIEW_ENABLED=false` actually removes the anonymous
      option from `/list`'s visibility select without touching anything
      already set to `anonymous`
- [ ] Run `npx playwright test tests/e2e/accessibility.spec.ts` against a
      real deploy and actually read the console output — it's report-only,
      so nothing fails the build even if it finds problems
- [ ] Remix a catalog quest twice in a row at the same intensity and
      confirm the second call is instant (cache hit) — check Upstash's
      dashboard for the `remix-cache:*` key if you want to confirm directly
- [ ] Hit the 5/day remix quota deliberately and confirm the 6th attempt
      is refused with a clear message, not a silent failure
- [ ] Export real PNG icons (180×180, 512×512) from
      `public/icons/icon.svg` and wire them into the manifest + `app/layout.tsx`
      before this goes live on an iPhone — the SVG-only setup works today on
      desktop/Android but not iOS home-screen add
- [ ] Run an actual Lighthouse pass post-deploy — LCP/CLS/JS-budget targets
      in `BUILD-PROMPT.md` were reviewed at the code level (see above) but
      never measured, on purpose (no fabricated numbers)
- [ ] Re-verify the contrast fixes visually, not just by the math — open
      `/list` and the nav with a real display and confirm the darker
      `ink-faint` and the new `error`/`error-on-dark` tokens still read as
      intentional design choices, not just "technically passing" grays
- [ ] `npm install` after pulling P8 — `xlsx` is a new dependency
- [ ] Full P8 walkthrough: paste a multi-line list into smart-paste on
      `/list`, confirm it splits sensibly and nothing commits until you
      click "Add selected"; separately, export a small CSV with a `title`
      and `category` column and import that too
- [ ] Write a blog post + a link on a private item — confirm no moderation
      call happens (check server logs) since it's never shown to anyone.
      Then set that item to `public` and re-save the blog post — confirm
      it now runs through the pipeline the same as the item's own title
- [ ] Create a board, invite a second test account as `contributor`,
      accept the invite from that account, suggest an item, comment on it,
      and confirm a `viewer`-role account can see but not post or add
- [ ] As an `editor`, confirm you can delete a `contributor`'s comment on a
      board item, not just your own
- [ ] Mark a board `discoverable`, request to join from a third account,
      accept the request as owner/editor, confirm the new member shows up
      and can now contribute
- [ ] Fill in the 12 placeholder catalog names (`BUILD-PROMPT.md` §12.1 —
      this has been on every phase's checklist since P1 and is still the
      single highest-leverage thing left before real signups)
- [x] ~~Decide on the `drizzle-orm` SQL-injection advisory~~ — done: bumped
      to `0.45.2` (+ `drizzle-kit` to `0.31.10`), verified via a real
      `drizzle-kit generate` run against the actual schema, not just a
      type-check. That run also caught a real pgvector-extension-ordering
      bug in migration sequencing — see the section above.
- [ ] Actually run the now-complete migration set
      (`0000_initial_schema.sql` through `0006_safety_p6.sql`) against a
      real dev Supabase project — `generate` and `typecheck` both passing
      offline is necessary but not sufficient; nothing has applied these
      to a live Postgres yet
- [ ] Re-run `npm audit` right before launch, not just now — advisories
      and available fixes change over time
- [ ] Add `npm run typecheck` and `npm test` to CI if they aren't already
      wired in somewhere — this session's first real run of both caught
      ~20 type errors and 2 test bugs that had been sitting invisibly
      across every prior phase

## Two real bugs found by the rate-limit fail-open fix, plus a broader one still open

Re-running the e2e suite after seeding the catalog surfaced a second real
bug in `lib/rate-limit.ts`, distinct from the "Upstash unconfigured" one
documented above: `Redis.fromEnv()` ran at **module top-level**, so it threw
synchronously the instant the file was imported — before `checkRateLimit`'s
own `try/catch` (which only wrapped the `.limit()` call) ever got a chance
to run. A dynamic `await import("@/lib/rate-limit")` call site can't catch
that either, since the throw happens during module evaluation, not the call.
Fixed by making both the `Redis` client and the limiter map lazy
(`getLimiters()` / `getRedis()`), constructed on first use, inside the
`try/catch` that's actually meant to handle infra failures. Same problem
existed one layer up in `lib/ai/remix-cache.ts` (`import { redis } from
"@/lib/rate-limit"` at its own top level); fixed the same way, with cache
read/write failures now degrading to "no cache" instead of throwing.

Resolved: the intermittent `mark-done.spec.ts` stuck-on-"Adding…" hang (and
the earlier `net::ERR_ABORTED` / `response.status: -1` trace noted above)
traced to `checkRateLimit`, not the RSC stream. `addCustomItem` is the only
"must never break" mutation that calls it (`markDone` and `addFromCatalog`
never do); with Upstash unconfigured, `getLimiters()`'s `Redis.fromEnv()`
client retried the doomed request 5 times with exponential backoff — a
deterministic, measured ~4.3–4.8s — before `checkRateLimit`'s `catch` could
fail open. That's on top of real getUser/insert latency, so total time
routinely landed at ~5.1–5.2s: just past Playwright's default 5s assertion
window and past a real user's patience, with no thrown error since the
fail-open path is designed to swallow it silently. `markDone`/`addFromCatalog`
never showed this because they skip `checkRateLimit` entirely *and* their
components use `useOptimistic` to flip the UI before the server call
resolves, masking any backend latency regardless of cause.

Fixed in `lib/rate-limit.ts` by constructing the Redis client with
`retry: false` — an unreachable/misconfigured Upstash is exactly the
fail-open case `checkRateLimit` exists for, so retrying before giving up
just delayed a decision already made. Confirmed live: `checkRateLimit`
dropped from ~4.7s to ~0.4–0.5s, and 7 consecutive `mark-done.spec.ts` runs
passed cleanly afterward (0/7 before the fix, on this same warmed server).
Not a substitute for the `UPSTASH_REDIS_REST_URL`/`TOKEN` checklist item
above — real credentials still needed before launch so this route is
actually rate-limited — but the fail-open path is now fast regardless of
whether that's ever done.

**Retracting my own earlier "not a Next.js streaming bug" claim.** After
deploying to Vercel (`before-ash.vercel.app`) and manually walking the
boards flow with real accounts, `net::ERR_ABORTED` on a Server Action's own
POST reproduced again — twice, independently, on `createBoard` and
`inviteMember`. Neither calls `checkRateLimit`; `createBoard` additionally
does a client-side `router.push()` after the action resolves, `inviteMember`
does not navigate at all — so this isn't the rate-limit tax, and it isn't
navigation-specific either. In both cases the mutation genuinely succeeded
server-side (the new board existed on reload; the invite showed up as
"contributor (pending)" in the member list, meaning `revalidatePath` had
already landed) — but the calling component's own `await inviteMember(...)`
/ `await createBoard(...)` promise never resolved, leaving the button stuck
("Creating…", or on `inviteMember`, silently reverting to "Invite" without
ever showing "Sent."). Confirmed intermittent, not deterministic:
`createBoard` hung on attempt 1 and succeeded cleanly on attempt 2 against
the same deployment; `inviteMember` hung 2/2 times in a scripted run. This
is exactly the mechanism the original note above speculated about — a
Next.js 15.5.23 Server Actions + `revalidatePath` interaction, specific to
the deployed (Vercel) environment, not reproduced in local `next dev` in
any of this session's testing. The rate-limit fix above was a real fix for
what it targeted, but it was likely also, coincidentally, a *mitigation*
for this broader issue on `addCustomItem` specifically — cutting ~4.3s off
every call shrinks whatever timing window triggers the abort, without
removing the underlying mechanism. Still open; needs investigation beyond
this session's scope (candidates: Next.js patch version, Vercel function
region vs. Supabase project region latency, `@supabase/ssr` cookie-handling
under Vercel's edge/serverless split) rather than an app-code guess-fix.
