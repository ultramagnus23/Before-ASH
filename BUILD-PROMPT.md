# BEFORE ASH — Master Build Prompt (v2, consolidated)

One file. Paste the fenced block at the bottom into Claude Code. Everything above it is context Claude Code should read first.

Product name: **Before ASH**. Working files: `before-ash/seed-quests.json` (491 items), `before-ash/prototype.html` (reference UI), `before-ash/merge-catalog.mjs` (catalog dedup pipeline).

---

## 0. What this is

A shared bucket list for Ashoka University. A catalog of things worth doing before you graduate, your own list on top of it, and a feed of people actually doing them. The product is not the list — it's the completion. Doing a thing in real life and stamping it.

## 1. Who it's for

**Primary:** the second-year. Past first-year novelty, three years left, quietly aware some of them are being wasted. **Secondary:** the first-year at week three, wants a map and permission. **Secondary:** the final-year, nostalgia plus a deadline, their completions are aspirational for everyone else. **Tertiary:** YIF and masters, one year, no patience for a slow product.

## 2. Tone

Dry, second-person, short. The app is not excited for you. `Stamped.` not `Congratulations!`. No exclamation marks in system copy, no em dashes.

## 3. The material world

A passport, as a full system, not a decorative badge. Navy buckram surround, gold foil hairlines, security-printed page stock, guilloche line-work at 5.5% opacity, four rubber stamp inks by category group appearing only on completion, a machine-readable zone in mono at the foot of the list encoding handle, batch, and stamped count. `before-ash/prototype.html` is the reference implementation — match its material system exactly, don't just take inspiration from it.

**Known prior art, addressed head-on:** competing apps (iBucket, The Bucket List App) already ship a "passport stamps" feature. Theirs is a stamp icon on a standard card. Ours is a material system — the execution has to be conspicuously better, because the metaphor alone isn't a differentiator.

**Banned:** glassmorphism, gradient text, side-stripe accents, identical card grids, hero-metric blocks, spinners, emoji in system copy, em dashes, confetti, streaks, badges, points, mascots.

## 4. Why this exists — the Bucket case study, condensed

Bucket (Trent Wann, San Diego State, launched Dec 2020) proved the insight — social bucket lists work, copying other people's goals is a real engine, "ask for help" turns a list into a reason to meet someone. It also hit a real ceiling: ~10k downloads after 5+ years, iOS only, 4.7 stars from a small base. Failure modes we are explicitly building around:

- **The core action crashed on launch.** A user tried adding an item ~60 times, gave up, used Keep Notes instead. → Add-to-list and mark-done get blocking e2e tests. Nothing else does.
- **A fan called the design generic**, in public, and it was never fixed. → The passport system exists because of this.
- **Paywall added, then a release literally titled "Removing paywall," then a paywall again at different pricing.** → Before ASH is free forever. No ads, no subscriptions, no monetisation code at all.
- **Custom items got squeezed out by the pre-generated catalog**, per a recent low review. → Custom item entry is a first-class field on `/list`, never behind a tab, never secondary to the catalog.
- **The app was iOS only**, a non-starter in India. → Before ASH is a web app, PWA-installable, no app store, no platform split.
- **A general social app needs millions of users before the feed feels alive.** A campus of ~3,000 needs about 300 actives for the same effect, because every entry is a place you can walk to. → Stay Ashoka-only until 300 weekly actives. Do not widen scope.
- **Their App Store listing carries a 13+ rating** for profanity, mature themes, and substance references — drift that happens without content policy from day one. → Moderation is specified in detail below, not bolted on later.

## 5. Locked decisions

| Area | Decision |
|---|---|
| Name | **Before ASH** |
| Catalog | 491 items, deduplicated, English only. 12 items flagged `placeholder: true` still need real Ashoka building/room names — do this before launch, it's the highest-leverage hour on the project. **Requires a real campus insider (you), not a web search or a model guess — see §12.1.** |
| User submissions | Any language — Hinglish and transliteration are the actual register on campus, the classifier must handle it |
| Photos | None, anywhere, in v1 |
| Bio | Opt-in, off by default, 140 chars, no links or handles |
| Contact exchange | Mutual consent only ("I'm in" on a shared quest, both sides accept), revocable by either side at any time |
| Visibility | Three states: `private` (appears nowhere, ever), `anonymous` (opt-in per item, held for human review — see §6), `public` |
| Monetisation | None. Free forever |
| Platform | Web only, PWA-installable, no native app |
| Scope | Ashoka only, until 300 weekly actives |
| Moderation staffing | **Solo — you are the only reviewer.** This changes the anonymous-review design; see §6 |
| Legal basis | DPDP Act 2023 compliant by design — see §8.1 |
| Succession | Stated end-of-life plan required before real user data is collected — see §13 |

## 6. Anonymous review, adjusted for a solo reviewer

Original design assumed three rotating reviewers. With one person who also has a September 30 paper deadline, the queue must fail safely and stay small enough to be a five-minute daily habit, not a job.

**The reviewer's two questions, unchanged:**
1. Does this break a rule?
2. Could three people on this campus work out who wrote it? If yes, reject as *too identifying* with a note on what to cut — this protects the author from a decision made at 2am, and is the actual point of human review.

**Adjustments for solo operation:**

- **Volume cap, tightened.** Eligibility: account ≥7 days old and ≥1 completed named item. Rate limit: **1 anonymous submission per user per week** (not per day — a solo reviewer cannot absorb a per-day cadence from an active base). Standing cap: **10 pending items sitewide**, hard stop — once 10 are pending, the anonymous option is disabled site-wide with a visible message (`Anonymous is paused. Back soon.`) until the queue clears. This is a circuit breaker, not a punishment.
- **SLA, honest.** Target 48 hours, not 12. No hard SLA that pages anyone, because there's no one else to page. If an item sits longer than 5 days, it auto-notifies the author with an apology and an offer to convert it to a named post instead, and stays pending — **never auto-approved.**
- **Fails closed always.** No reviewer available this week (paper crunch, travel) simply means the queue holds and the site-wide pause kicks in at 10. The product must degrade to "anonymous temporarily unavailable," never to "unreviewed content goes public."
- **A visible kill switch.** `ANON_REVIEW_ENABLED` env flag. If you know a bad week is coming, flip it off in advance — the anonymous checkbox disappears from the composer, existing pending items still get reviewed when you're back, nothing breaks.
- **Named posts still skip human review entirely** and go through the two automated layers only. This is what keeps the product usable even when the queue is paused — named posting, which is most of the product, never stops.
- Everything else from the original design holds: the reviewer never sees `owner_id` (enforced by the `review_queue` view excluding it, not by UI), the item stays on the author's own list throughout review, identity reveal requires a written reason and is logged append-only (co-sign requirement drops to none when there's only one admin, but the written reason and audit log stay mandatory), rejection copy is written to the author, not about them.

**The honest fallback, stated once:** if the cap-and-pause mechanism still isn't sustainable once real usage starts, the correct move is to disable `ANON_REVIEW_ENABLED` and ship with named-only posting rather than let review quality slip. Half-reviewed anonymity is worse than none.

## 7. Moderation, full pipeline (applies to all public submissions)

```
input
 ├─ 1. deterministic filter: slurs, URLs, phone/room-number patterns, repeated chars
 │       → block outright, no model call
 ├─ 2. LLM classifier (open-source model via callModel(), JSON only, temperature 0)
 │       receives ONLY the raw text — no user_id, item_id, handle, or email
 │       scores: names_person, sexual, harassment, dangerous, illegal, discriminatory
 │       must explicitly handle Hinglish and transliterated Hindi
 │       ≥0.7 any dimension → rejected, reason shown
 │       0.4–0.7            → held (named: admin queue; anonymous: human review, §6)
 │       else               → approved
 └─ 3. community reports → 3 reports auto-hides, into admin queue, never deleted from log
```

`names_person` — a proper noun referring to a specific living non-public individual in an actionable context — is the highest-weighted signal. This is the rule that stops the product becoming a harassment board, and no competitor in the case study enforces it.

### 7.1 Report abuse (new)

Three reports auto-hiding content is exploitable by a small coordinated group against a disliked but innocent post. Mitigations, all required:

- **Report rate limit.** Max 5 reports filed per user per day, across all content. Filing a report is itself a mutating route and goes through the standard rate limiter (§9).
- **Weighted, not raw, count.** The 3-report auto-hide threshold counts *distinct-reporter, distinct-reason* reports. Three reports from accounts created the same week, or three reports with no reason text, escalate to the admin queue instead of auto-hiding — auto-hide is reserved for reports that look organic.
- **Auto-hide is reversible, always.** Auto-hidden named content goes into the same admin queue as anonymous holds, reviewed on the same cadence, restorable with one click. It is a "pull from view pending review" action, not a takedown.
- **Appeal path.** A hidden post's author is notified (what was hidden, not who reported it) and can submit one free-text appeal, which jumps the item to the top of the admin queue. This is the only queue-priority mechanism in the product — everything else is FIFO.
- **`reports` table already logs everything per §7 and §8** — this section is enforcement logic on top of that table, not a new one.

## 8. Privacy, non-negotiable

- `private` items are unreachable by any other user through any path — feeds, counts, aggregates, search, embeddings, AI prompts, admin panel. Enforced at RLS **and** in the serializer, with a test.
- `list_items.note` never appears in any public-facing response. Test that fails if it does.
- `anonymous` items strip `owner_id`/`handle` entirely server-side — absent, not hashed.
- Email lives only in `auth.users`, never selected or displayed.
- No third-party analytics, no ad SDKs, no cross-site tracking. First-party `events` table only, schema published on a privacy page.
- `DELETE /account` hard-deletes with cascade and a 30-day recovery token, shipped in v1.

### 8.1 DPDP Act 2023 compliance (new)

Before ASH stores personal data of Indian students (bio, connection requests, identity-reveal logs, event telemetry) and is squarely in scope of India's Digital Personal Data Protection Act, 2023. This is not a legal-team problem to defer — a solo-founder campus app is exactly the profile that skips this and regrets it. Minimum viable compliance for launch:

- **Notice at consent, not buried in a policy page.** The signup flow (§8.2) shows, in plain language before the first magic link is sent: what is collected (handle, email for auth only, optional bio, list items, completion events), why (to run the product), and that it is never sold or shared with third parties.
- **Purpose limitation.** Data collected for one feature (e.g. connection requests) is not repurposed for another (e.g. AI training, ads) without new consent. Since there are no ads and no third-party sharing, this is mostly a matter of stating it, but the `events` schema on the privacy page (§8) doubles as the DPDP-required processing disclosure.
- **Data Principal rights, concretely implemented, not just promised:** right to access (a "download my data" export, JSON, from account settings), right to correction (edit bio/handle in-app), right to erasure (the existing `DELETE /account` flow, §8, satisfies this — the 30-day recovery token is a grace period, not a refusal).
- **Breach notification commitment.** State on the privacy page that in the event of a data breach, affected users are notified within 72 hours, matching the SDPI/DPDP direction of travel even before the Board's rules fully bite.
- **Consent Manager / grievance officer.** As a solo operator, you are the de facto grievance officer. Name yourself as such on the grievance page (already scheduled in P6) with a real response-time commitment (e.g. 5 working days), which DPDP requires from any data fiduciary.
- This is a short, plainly-worded paragraph on the privacy page, not a legal document — but it must exist before signups open, not be a P8 afterthought.

### 8.2 Consent UX at signup (new)

Terms, privacy, and grievance pages existing (P6) is not the same as a user having agreed to them. Required, blocking:

- The magic-link request form shows a single checkbox: "I've read the [Terms], [Privacy], and [Community rules]. Send me a link." — unchecked, the submit button stays disabled. No pre-checked box.
- This is logged once, server-side, as a row (`user_id`, `policy_version`, `accepted_at`) — not just a client-side gate. If policy text materially changes later, bump `policy_version` and require re-acceptance on next login before any write action.
- The composer for any public or anonymous post links the community rules inline, above the text field, per the original P6 spec — this stays, in addition to the signup-time acceptance, because most people don't recall a checkbox they clicked once at signup.

## 9. Rate limits and report abuse — see §7.1 for the report-specific addition. All other rate limits carried from the original TRD §2.7 (Upstash Redis, per-route, per-user).

## 10. Admin panel security (hardened)

`ADMIN_HANDLES` allowlist gates the one account that can see `review_queue` contents and unmask anonymous posts via `identity_reveals`. An email allowlist alone is not enough for that blast radius:

- **MFA required on the admin account.** Supabase Auth TOTP MFA enforced at the `/admin` route middleware — a valid session without a verified MFA factor is redirected to enrol, not let through.
- **Session-scoped, short-lived admin elevation.** `/admin` routes check MFA-verified-at-most-N-hours-ago, not just "MFA exists on this account," so a stale browser session doesn't carry standing admin power indefinitely.
- **Every `/admin` action writes to `moderation_log` or `identity_reveals` as already specified** — this section adds the auth hardening in front of those already-audited actions, it doesn't change the log schema.
- Given solo staffing, this is the single highest-value security control in the product: one compromised admin session is a full breach of every anonymous author's identity.

## 11. Accessibility (expanded)

The original spec calls out reduced-motion and a keyboard equivalent for the stamp interaction only. Extended to the whole product, because a navy/gold passport aesthetic is a genuine contrast risk:

- **Contrast audit on the passport palette specifically.** Gold foil on navy buckram is the signature look and the easiest place to fail WCAG AA. Any gold-on-navy text must be checked against a 4.5:1 (body) / 3:1 (large text) ratio; where foil-gold fails, use a lighter tint for text while keeping true gold for non-text foil hairlines and stamp ink, which aren't held to text-contrast rules.
- **`prefers-reduced-motion` applies product-wide**, not just to the stamp: page transitions, the MRZ strip's ambient shimmer (if any), toasts, and the feed's entry animation all get a static equivalent, not just the signature interaction.
- **Screen-reader labels on every non-text status.** Stamp ink category, completion state, review-pending state, and the MRZ strip's encoded data all need an `aria-label` or visually-hidden text equivalent — none of these should be conveyed by color or icon alone.
- **Keyboard equivalents beyond the stamp:** the press-and-hold stamp gesture already has one (focus + Enter + confirm, per the original spec); the same standard applies to swipe-to-reveal or drag-based interactions anywhere else in the feed or connection flow — no interaction should be mouse/touch-only.
- **Focus order and visible focus rings** on `/list`, `/explore`, `/feed`, and `/admin` — the admin review UI is explicitly speced as keyboard-driven (P6) and needs the same focus-visibility bar as the rest of the product.
- Add an automated `axe-core` pass to CI on the four core routes above, non-blocking at first (report only), promoted to blocking once the passport palette contrast issues are fixed.

### 11.1 Contrast audit results (done in P7)

Computed real WCAG contrast ratios (not eyeballed) for every color combination actually used as text in the built app. Three failures found and fixed — all in `app/globals.css` and the call sites that used the wrong token:

| Combination | Ratio found | Verdict | Fix |
|---|---|---|---|
| `--color-foil` on `--color-cover` (100% opacity) | 9.11:1 | Pass | none needed |
| `--color-foil-dim` on `--color-cover` | 4.55:1 | Pass (barely) | none needed, but see next row |
| `text-foil/55` (opacity-reduced foil) on cover, used for inactive nav links | 3.68:1 | **Fail** (needs 4.5:1 at this text size) | Opacity blends toward the background and silently drops contrast — switched to the solid `--color-foil-dim` token instead of a dimmer foil |
| `text-page/45` on cover, used for the cover form's gate text | 3.9:1 | **Fail** | Bumped to `text-page/60` (5.87:1) |
| `--color-ink-faint` (original `oklch(0.635 0.016 262)`) on `--color-page` | 2.92:1 | **Fail badly** — under the table's own 3:1 large-text floor, let alone 4.5:1 body text | Darkened the token itself to `oklch(0.5 0.016 262)` — 5.11:1 on page, 4.56:1 on page-sunk. This is used everywhere (category labels, timestamps, visibility badges), so the token was fixed once rather than patching call sites |
| `--color-stamp-vermilion` used directly as error-message text | 4.36:1 on page, 3.24:1 on cover | **Fail on both** | The stamp ink is a fixed brand color for stamp badges (a graphic element, not held to text-contrast rules) — added two new text-only tokens instead of changing the brand color: `--color-error` (`oklch(0.5 0.19 28)`, 5.64:1 on page) and `--color-error-on-dark` (`oklch(0.78 0.14 28)`, 7.66:1 on cover/void) |

`axe-core` (`tests/e2e/accessibility.spec.ts`) is still report-only, per the line above — these fixes were found by computing contrast ratios directly (see the OKLCH→sRGB→relative-luminance math used during the P7 build), not by running that test against a live deploy. Once it's run live and comes back clean, promote it to a blocking assertion.

## 12. Catalog

Load `before-ash/seed-quests.json` (491 items, 15 categories). 12 items are flagged `placeholder:true` and use generic campus nouns.

### 12.1 The placeholder items need you, not a search engine

I looked up Ashoka University's Sonipat campus to try to fill these in and only confirmed generic facts (4 academic blocks, 5 residence halls, 2 amphitheatres, a ground-floor admin reception, a 16-bed infirmary) — nothing specific enough to safely name a hostel, a mess station, or "the room everyone walks past" without a real chance of being wrong. Shipping a wrong building name to your own campus is worse than shipping a generic placeholder, so I did not guess. This is exactly the "highest-leverage hour" the original spec calls out — it has to come from someone who's actually walked the campus. The 12 items, with the generic phrase that needs a real name:

| id | generic phrase to replace |
|---|---|
| CP-1001 | "the roofless side of campus" |
| CP-1003 | "the two furthest buildings on campus" |
| CP-1007 | "the library" (confirm name/wing if it has one) |
| CP-1009 | "the amphitheatre" (campus has two — which one, or both) |
| CP-1018 | "the room everyone walks past" |
| FD-1041 | "the mess menu" (name the mess/dining hall) |
| FD-1048 | "the first hour it opens" (name the place) |
| PP-1057 | "the mess" |
| CP-1213 | "the noticeboard" (which one — admin block, mess, library) |
| CP-1226 | "the three buildings you never enter" |
| FD-1254 | "the place everyone dismisses" |
| AD-1485 | "the clinic, the office, the desk" (name each) |

Fill these directly in `seed-quests.json` (drop the `placeholder: true` key once replaced) before the P1 seed load. If you'd rather not spend the hour right now, ship these 12 with better generic phrasing (still no fabricated specifics) and backfill real names post-launch — but track them as a known gap, don't silently forget them.

Custom item entry is a first-class field on `/list`, never behind a tab, never secondary to the catalog. Track custom-items-per-active-list as a metric; if it falls below 1 custom item per 3 catalog items, that's a signal the catalog is dominating and needs shortening, not adding to.

## 13. End-of-life / succession plan (new)

`ANON_REVIEW_ENABLED` and the 10-item cap handle a busy week. They say nothing about what happens when the one person running this graduates, loses interest, or simply stops. A product holding real students' connection requests and identity-reveal logs needs a stated answer before it collects a single row of real data, not after:

- **State a sunset trigger, publicly, on the privacy page.** E.g.: "If Before ASH has no active maintainer for 6 months, or the maintainer graduates without a successor, the product will be shut down with 30 days' notice and all user data deleted, not sold or transferred."
- **No silent handoff.** If a successor does take over (e.g. a campus club or the next class), that requires the same consent-notice treatment as any other material policy change (§8.2's `policy_version` bump) — users are told, not defaulted into a new operator.
- **Data has a maximum retention shape even absent shutdown.** `identity_reveals` and `moderation_log` are append-only and never auto-deleted (needed for accountability), but dormant accounts (no login in 18 months) get a data-minimization pass: bio and connection history purged, list completions kept only in anonymized aggregate.
- This is two paragraphs on the privacy page and one cron job, not a legal entity or a foundation — the point is that it exists in writing before launch, so "what happens to my data if you disappear" has an answer a first-year can read.

## 13.1 Per-item blog + links (new)

An item can carry more than the one-line `proof` field: an optional longer write-up ("blog post") plus optional external links (Instagram, a personal blog, Strava, whatever). Entirely opt-in — the core add/stamp flow never requires it, never blocks on it, and never surfaces it as a nag.

- **New table `item_posts`.** `kind` is `'blog'` or `'comment'`. A `list_item` post is always `kind='blog'` — your own item doesn't have a comment thread, just your own optional write-up. A `board_item` post (§13.3) can be either, since a shared board is a group discussion space.
- **Visibility inherits from the parent.** A blog post on a `private` list item is never visible to anyone but the owner, same as the item itself. A blog post on a `public`/`anonymous` item goes through the same moderation pipeline as any other public text (§7) before anyone else sees it — it's free-form user text and gets no exemption just because it's "just a blog post."
- **Links are data, never fetched server-side.** Up to 5 links per post, validated as `http`/`https` URLs at the Zod boundary, rendered as plain outbound links. No server-side link unfurling/preview generation — fetching a URL server-side to build a preview card would leak this server's IP and request timing to whatever site is linked, for a cosmetic feature that isn't worth that tradeoff. If link previews are wanted later, they run client-side (the visitor's own browser fetches the OG tags, not ours) or not at all.
- **An anonymous item's blog post still strips owner fields server-side**, identically to the item itself (§8 non-negotiable #3) — the author field on an anonymous blog post is absent, not hashed.

## 13.2 Bulk import (new)

The single biggest adoption cost this product has is "I already have a list somewhere else and don't want to retype it." Two import paths, both optional, both funneling into the exact same add-to-list code path as a manual single add (no parallel "imported item" type that behaves differently later):

- **Smart paste.** A user pastes free-form text (their Notes app list, a WhatsApp message, whatever). The text goes through `callModel({ task: 'segment', text })` — a new `callModel` task, same minimal-payload contract as every other call (§14.1): only the pasted text, nothing else. The model returns a plain array of candidate item titles; nothing about the source, the user, or prior calls is retained by the call itself. Every segmented item lands in the user's list as `visibility: 'private'` and `review_state: 'draft'` by default — segmentation never publishes anything, it only proposes items for the user to review, edit, or discard before anything is saved.
- **CSV / Excel import.** Parsed entirely client-side or in a stateless server route with no LLM involved — columns map to title/category/visibility with a preview-before-commit step. This is a structured-data problem, not a language problem, so it doesn't touch `callModel` at all.
- **Both paths show a preview, never auto-commit.** Whether it's 3 items or 30, the user sees the parsed list and can deselect/edit/retitle before anything is written — "the platform decided this for you without asking" is exactly the kind of thing that erodes trust in a tool meant to feel dry and deliberate, not magical.

## 13.3 Shared boards + collaboration (new)

Distinct from a personal list: a **board** is a shared collection of quest suggestions that a group curates together, with role-based collaboration. Stamping/completion is deliberately NOT shared state — see below for why.

- **New tables:** `boards`, `board_members` (role: `owner` / `editor` / `contributor` / `viewer`, status: `invited` / `accepted` / `declined`), `board_items` (a suggestion on the board — wraps a catalog `quest_id` or a bespoke `custom_title`), `board_join_requests` (for the discoverable "looking for people" path, distinct from a direct invite).
- **Roles, exactly as specified:**
  - `viewer` — read-only.
  - `contributor` ("commenter or blog-post editor") — can add new board item suggestions and post blog/comments (`item_posts` with `board_item_id` set), cannot edit or remove someone else's suggestion.
  - `editor` — everything a contributor can, plus edit/remove any board item and moderate (delete) any post on the board.
  - `owner` — everything an editor can, plus manage membership/roles and delete the board.
- **Completion stays personal, on purpose.** A board is a shared *suggestion list*, not a shared *completion state*. When a member wants to actually do a board item, they add it to their own list — which creates a normal `list_items` row exactly like adding from `/explore` today. This means the stamp/mark-done code path, which is the one thing in this whole product that may never break (non-negotiable #20 in the original prompt block), stays completely untouched by this feature. Shared multi-person completion state (e.g. "mark done for the whole board") is explicitly out of scope — it would require rethinking the stamp as a group action, which is a different product decision than "let people collaborate on a suggestion list."
- **Two ways to join, both consent-based, matching the product's existing mutual-consent posture (§5, contact exchange):**
  - **Direct invite:** an owner/editor invites a specific handle; the invitee sees "X invited you to join Y — accept?" and the row sits at `status='invited'` until they respond. No one is added to a board without acting on an explicit prompt.
  - **Looking for people:** a board can be marked `discoverable`, which lists it (title + description only, never member identities) somewhere a prospective joiner can browse and request to join. A `board_join_request` sits pending until an owner/editor accepts or declines it — this is the same shape as "I'm in" on an individual quest, generalized to board membership.
- **Privacy carries over unchanged.** Board membership, roles, and join requests are all still subject to blocks (§8) — a blocked user can't see or request to join a board created by someone who's blocked them, and RLS on `board_members`/`board_items` defaults to deny exactly like every other table in this schema.

## 13.4 What "contact exchange" actually reveals (clarified during P5)

§5 says contact exchange is "mutual consent only... revocable by either side at any time" but never specifies the payload — there's no phone/email/social-link field anywhere in the schema, and email is explicitly never shown (§8). Resolved during P5's build as follows, since it had to be decided to implement `connections` at all:

- The only identity-shaped thing worth gating is a **handle**, and the only case where a handle is actually hidden from someone is an **anonymous item's owner**. For a `public` item the owner's handle is already shown in the feed, so "connecting" on a public item is a mutual acknowledgment, not an actual reveal of new information.
- The asymmetry that matters: the **owner** needs to see who's interested to decide whether to accept — that was never hidden, clicking "I'm in" is not itself an anonymous gesture. What's gated behind mutual consent is specifically the **interested party learning the anonymous owner's handle**, which only happens once the owner has also accepted.
- Revoking resets the connection to requiring fresh mutual consent from both sides again (both `owner_accepted` and `interested_accepted` go back to false) — re-expressing interest after a revoke does not silently restore a previously-mutual connection.
- If a future feature actually wants to exchange something more sensitive (a phone number, an external social handle), that needs a new field and a new non-negotiable about where it can and can't appear — don't assume `connections` already covers it.

## 13.5 P8 implementation notes

- **`callModel`'s `'segment'` task was speced in §14.1 back in P5 but never actually implemented until P8** — the type existed on `CallModelInput`/`CallModelResult` with no corresponding function. Built now in `lib/ai/call-model.ts`: same minimal-payload contract as every other task, returns a plain string array, never invents items not present in the source text.
- **CSV/Excel import added a real dependency, `xlsx` (SheetJS community edition)** — the only new npm package added since P1. Parsing happens entirely client-side via `import("xlsx")` in the browser; the file never reaches the server for this path, matching §13.2's "a structured-data problem, not a language problem, so it doesn't touch `callModel` at all."
- **Blog posts on a personal item are upserted, not inserted as a thread** — `kind='blog'` + `list_item_id` is treated as a singular slot (find-existing-or-insert in `lib/item-posts/actions.ts`'s `setBlogPost`), matching §13.1's "your own item doesn't have a comment thread, just your own optional write-up." Board item posts (`board_item_id` set) are always plain inserts, since a board is a group discussion space and multiple comments are expected.
- **A gap caught during this build, not after:** the board-item-card UI initially only let a post's own author delete it, even though the RLS policy (`item_posts_delete_own_or_board_editor`, `db/migrations/0002_boards_and_posts.sql`) already correctly allows an editor/owner to delete anyone's post on the board — the "moderate any post" half of §13.3's editor-role definition. Fixed before merge; the UI now matches what the database already permitted.
- **Import commits never touch the moderation pipeline** — every imported item lands `visibility: 'private'`, `review_state: 'draft'`, identical to a manual single add via `addCustomItem`. Bulk import is exclusively about getting text into the user's own list faster; it has no bearing on what becomes public later, which still goes through `setVisibility` and the full three-layer pipeline exactly as if the item had been typed by hand.

---

## 14. Stack

Next.js 15 App Router, TypeScript strict, Tailwind v4, Drizzle ORM, Supabase (Postgres + magic-link auth restricted to `@ashoka.edu.in` + RLS + pgvector), Upstash Redis for rate limits, an open-source LLM served from an inference endpoint you control (Ollama by default — no Anthropic/OpenAI/any third-party-hosted-closed-model API anywhere in the app), Vercel deploy, PWA manifest. No separate backend, no native app.

### 14.1 LLM data boundary (non-negotiable, supersedes the original AI section)

The user does not want Anthropic, or any LLM provider, receiving anything beyond the bare text being classified/embedded/remixed — not because the model runs locally, but as a hard architectural rule enforced regardless of where the model is hosted:

- **Model:** an open-weight model (e.g. Llama 3.1, Qwen2.5, Mistral) served via Ollama or any OpenAI-compatible endpoint you host or control. `LLM_API_URL` and `LLM_MODEL_NAME` are the only config — no vendor SDK, no API key tied to a named account with usage tied back to Before ASH's identity if avoidable.
- **`callModel()` signature is minimal on purpose:** `callModel({ task: 'moderate' | 'embed' | 'remix' | 'segment', text: string }) → result`. `'segment'` (§13.2, bulk smart-paste) is the newest task and follows the identical rule — it accepts **only** the literal text string and a task label. It never accepts, and must be typed to reject, `userId`, `itemId`, `handle`, `email`, `timestamp`, or any other field that could correlate the call to a specific person, a specific list, or a specific prior call about the same item.
- **No re-identification path.** Nothing sent to the model — request or prompt — includes an item ID, a hash of one, or any stable identifier that would let the inference log correlate two calls as "the same quest" or "the same author" over time. Each call is a stateless, disposable string in and a result out.
- **Result handling happens entirely on our side.** The classifier score, embedding vector, or remix text comes back from `callModel()` and is then associated with the item/user in our own database — that association is made by our server code after the call returns, never sent to or made visible to the model.
- **If self-hosting Ollama:** point `LLM_API_URL` at your own inference box (a small always-on VPS or a spare GPU machine) so nothing leaves your infrastructure at all. If you instead use a hosted endpoint serving an open-weight model, the same minimal-payload rule in `callModel()` still applies — the provider only ever sees anonymous text, never who it came from.
- **Semantic search embeddings** (pgvector) go through the same `callModel({task:'embed', text})` path — catalog seed text is not personal data, but user-submitted custom items still only ever send the raw text, nothing else.
- **`AI_ENABLED` kill switch still applies** — if the inference endpoint is down or you want to disable AI features entirely, the product degrades to keyword/trigram search and skips remix/side-quests, exactly as speced, moderation still runs on the deterministic filter + human review layers.

## 15. Full schema, RLS, API surface, moderation cost controls, performance targets

Carried over unchanged from the original PRD/TRD — Claude Code should still read these in full before starting:
- Schema (profiles, quests, list_items, interests, connections, reactions, blocks, reports, moderation_log, events) plus the review-queue additions (review_state enum, review_assignments, identity_reveals) — see the original `BWG-PRD-TRD-BuildPrompt.md` §2.2 and `ANON-REVIEW.md` §7 for exact DDL.
- RLS policies — §2.3 of the same, plus the `review_queue` view that deliberately excludes `owner_id`.
- API surface — §2.4.
- AI cost controls (remix quota 5/day, moderation classifier, weekly side-quests, embeddings) — §2.6, all server-side, all through one `callModel()` wrapper with an `AI_ENABLED` kill switch.
- Rate limits — §2.7, plus the report-abuse rate limit added in §7.1.
- Performance targets: LCP <1.5s on 4G mid-range Android, <180KB JS on `/list`, no CLS, optimistic mutations throughout.
- Accessibility targets — §11 above (new): WCAG AA contrast on the passport palette, `prefers-reduced-motion` product-wide, `axe-core` in CI.

---

## 16. THE PROMPT — paste this block into Claude Code

```
You are building "Before ASH", a campus bucket-list web app for Ashoka
University, Sonipat. Read this entire document first. Reference files:
  before-ash/seed-quests.json    491-item seed catalog
  before-ash/prototype.html      visual reference implementation
  before-ash/merge-catalog.mjs   catalog dedup pipeline, for future additions

STACK (do not substitute)
  Next.js 15 App Router · TypeScript strict · Tailwind v4 · Drizzle ORM
  Supabase (Postgres + magic-link auth + RLS + pgvector)
  Upstash Redis rate limiting · open-source LLM via a self-controlled inference
  endpoint (Ollama by default) — NO Anthropic/OpenAI/any closed third-party
  model API anywhere in this app, server-side only, see §14.1 for the strict
  data-minimization contract on every call
  Deploy: Vercel. No separate backend. No native app. PWA manifest, installable
  to a home screen, but it is a website — no app store, no platform split.

NON-NEGOTIABLES — violating any of these is a build failure

  PRIVACY
  1. visibility='private' items are unreachable by any other user through any
     path: feeds, counts, aggregates, search, embeddings, AI prompts, admin.
     Enforce at RLS AND in the serializer. Write a test.
  2. list_items.note never appears in any public serializer. Write a test that
     fails if it does.
  3. visibility='anonymous' responses never contain owner_id or handle. Absent,
     not hashed. Stripped server-side.
  4. Email lives only in auth.users. Never selected, displayed, or searchable.
  5. Bio is opt-in, off and empty by default, 140 chars max, strips URLs and
     @handles server-side.
  6. Contact details reveal only when both sides of a connections row have
     accepted. Either side revokes it instantly.
  7. No image uploads anywhere.
  8. No third-party analytics, no ad SDKs, no cross-site tracking. First-party
     events table only, schema published on the privacy page.
  9. DELETE /account hard-deletes with cascade, 30-day recovery token. Ships now.
  10. DPDP Act 2023 minimum viable compliance: plain-language notice-at-consent
      before first magic link, data-export endpoint (access right), in-app
      bio/handle edit (correction right), DELETE /account (erasure right),
      72-hour breach-notification commitment on the privacy page, named
      grievance-officer contact with a stated response SLA.
  11. Signup consent is blocking, not implicit: a single unchecked-by-default
      checkbox against Terms/Privacy/Community-rules gates the magic-link
      submit button, AND a server-side row (user_id, policy_version,
      accepted_at) is written on acceptance. Bump policy_version and require
      re-acceptance before any write action if policy text materially changes.
  12. Published end-of-life statement on the privacy page: sunset trigger
      (e.g. 6 months no active maintainer), 30-day shutdown notice, data
      deleted not sold/transferred on shutdown, no silent operator handoff
      (any handoff triggers the same consent-notice flow as #11). Dormant
      accounts (no login 18 months) get bio/connection-history purged on a
      cron, list completions retained only as anonymized aggregate.

  SAFETY — ANONYMOUS REVIEW IS SOLO-MODERATOR SCALED
  13. Every public submission passes deterministic filter + LLM classifier
      (open-source model via callModel(), JSON only, temp 0, six scored
      dimensions, names_person weighted highest, must handle Hinglish/
      transliterated Hindi) before anyone but its author sees it. The
      classifier call carries ONLY the submission text — no user_id, item_id,
      handle, or email ever reaches the model, per §14.1.
  14. Anonymous items additionally require mandatory human approval. There is
      exactly one moderator. Therefore:
      a. Eligibility: account ≥7 days old AND ≥1 completed named item.
      b. Rate limit: 1 anonymous submission per user per WEEK.
      c. Standing cap: 10 pending anonymous items sitewide. At the cap, the
         anonymous option disables site-wide automatically with the message
         "Anonymous is paused. Back soon." until the queue clears below cap.
      d. No auto-approve on any timeout, ever. If an item exceeds 5 days
         pending, auto-notify the author with an apology and an offer to
         convert to a named post. The item stays pending regardless.
      e. Named posts skip human review entirely — automated layers only. This
         must keep working even when the anonymous queue is paused.
      f. An ANON_REVIEW_ENABLED env flag hides the anonymous checkbox from the
         composer entirely when off, without breaking anything already queued.
      g. The reviewer-facing query (a Postgres view, review_queue) must NOT
         select owner_id, handle, or email under any circumstance. Reviewers
         see: item text, category, classifier scores, account-age bucket
         (<1mo/1-6mo/6mo+), and prior-rejection count only.
      h. Identity reveal requires a written reason (≥20 chars) and writes an
         append-only row to identity_reveals. No delete/update permission on
         that table at the DB level.
      i. The item remains visible on the author's OWN list throughout review;
         only its public appearance is gated.
  15. Report and block on every card and profile, one tap. Report filing is
      itself rate-limited (max 5 reports/user/day) through the same limiter
      as other mutating routes. The 3-report auto-hide threshold counts only
      distinct-reporter, distinct-reason reports with stated reasons from
      accounts not all created in the same window; reports that don't meet
      that bar escalate to the admin queue instead of auto-hiding. Auto-hide
      is reversible (goes to admin queue, one-click restore), never a
      silent takedown. The hidden post's author is notified (never told who
      reported) and can file one free-text appeal that jumps the item to the
      top of the admin queue — the only queue-priority mechanism in the
      product. Full audit log in moderation_log, never deleted.
  16. Signup restricted to @ashoka.edu.in, validated server-side.
  17. /admin (review_queue access, identity_reveals unmask) requires: allowlist
      via ADMIN_HANDLES AND a verified MFA factor (Supabase Auth TOTP) checked
      at route middleware, re-verified if the MFA check is older than a few
      hours. A valid session without recent MFA verification is redirected to
      enrol/reverify, never let through on allowlist membership alone.

  ENGINEERING
  18. LLM_API_URL and SUPABASE_SERVICE_ROLE_KEY are server-only. Fail the
      build if either reaches a client bundle. No Anthropic/OpenAI/any
      closed-model vendor SDK or API key anywhere in the codebase.
  19. All AI calls go through one callModel() wrapper whose type signature
      accepts only { task, text } — no userId/itemId/handle/email fields
      exist on that type, so passing them is a compile error, not a runtime
      discipline. Wrapper enforces per-user quota, cost/ops logging (call
      count and task type only, never the text or an identifier), and an
      AI_ENABLED kill switch.
  20. E2E tests on add-to-list and mark-done, blocking merge. These are the
      two paths that may never break — a prior competitor lost its whole
      first cohort to a crash on exactly this action.
  21. No monetisation code whatsoever. No paywall, no subscription, no ads.
  22. Automated axe-core accessibility pass in CI on /list, /explore, /feed,
      /admin — report-only initially, promoted to blocking once the passport
      palette's gold-on-navy text passes WCAG AA contrast (4.5:1 body / 3:1
      large text; true gold may stay on non-text foil/stamp elements).

DESIGN
  Passport as a full material system, not a decorative badge — competitors
  already have decorative passport-stamp icons, so ours must be conspicuously
  better executed to differentiate at all. Navy buckram surround, gold foil
  hairlines, security-printed page stock, guilloche at 5.5% opacity, four
  stamp inks by category group appearing ONLY on completion, MRZ strip in
  Courier Prime at the foot of /list. Match before-ash/prototype.html exactly.
  The press-and-hold completion animation is the signature and gets more
  design attention than any other single element.

  Accessibility is part of the design spec, not a separate pass: contrast-
  audit the gold-on-navy palette specifically before shipping any screen that
  uses it for text; prefers-reduced-motion covers page transitions and toasts,
  not just the stamp; every non-text status (stamp ink category, review-
  pending state, MRZ-encoded data) has a screen-reader-equivalent label;
  no interaction anywhere is mouse/touch-only.

  Banned: glassmorphism, gradient text, side-stripe accents, identical card
  grids, hero-metric blocks, spinners, emoji in system copy, em dashes,
  confetti, streaks, badges, points, mascots.

  Copy: dry, second-person, short, sentence case, no em dashes. "Stamped."
  not "Congratulations!"

CATALOG
  Load before-ash/seed-quests.json (491 items, 15 categories). 12 items are
  flagged placeholder:true and use generic campus nouns instead of real
  Ashoka building/room/mess names — these require firsthand campus knowledge
  to fix correctly (a model or web search cannot verify current building
  names reliably) and must be surfaced in a setup checklist, never silently
  shipped as-is. See BUILD-PROMPT.md §12.1 for the exact list and the generic
  phrase each one needs replaced.

  Custom item entry is a first-class field on /list, never behind a tab,
  never secondary to the catalog. Track custom-items-per-active-list as a
  metric; if it falls below 1 custom item per 3 catalog items, that's a
  signal the catalog is dominating and needs shortening, not adding to.

BUILD IN PHASES. Stop after each. Show me. Wait.

  P1 Foundation    Scaffold, design tokens, fonts with matched fallback
                   metrics, Drizzle schema (profiles, quests, list_items with
                   review_state, interests, connections, reactions, blocks,
                   reports, moderation_log, review_assignments,
                   identity_reveals, events), all RLS policies including the
                   review_queue view with owner_id excluded, seed loader with
                   batched pgvector embeddings. Deliver a passing RLS test
                   proving cross-user private reads fail.
  P2 Auth          Magic link, domain-restricted, handle claim with reserved
                   words, opt-in bio, generated avatar from handle hash,
                   route middleware, DELETE /account with recovery token,
                   blocking consent checkbox + policy_version acceptance row
                   ahead of the first magic link.
  P3 List+Catalog  /list as the home screen. /explore with filters and
                   pgvector semantic search, trigram fallback for short
                   queries. Custom item creation first-class. Optimistic add,
                   e2e test blocking merge.
  P4 The stamp     Press-and-hold, progress arc, seeded per-item rotation,
                   four inks by category, proof text field, reduced-motion
                   variant, keyboard equivalent (focus + Enter + confirm).
                   E2e test blocking merge. Spend real effort — this is
                   the product.
  P5 Feed+Social   /feed cursor-paginated, RSC first page, block filtering,
                   anonymous rows appear only once review_state='approved'
                   and strip owner fields. "I'm in" + mutual-consent
                   connection flow. /u/[handle], /q/[slug].
  P6 Safety        Three-layer moderation pipeline. Anonymous review queue
                   exactly per the solo-moderator rules above, including the
                   10-item circuit breaker and the ANON_REVIEW_ENABLED flag.
                   Report-abuse mitigations (rate limit, weighted threshold,
                   reversible auto-hide, appeal path). /admin gated on
                   ADMIN_HANDLES + MFA, keyboard-driven single-item review UI
                   showing only the permitted fields. Rate limits on every
                   mutating route. Policy/privacy/terms/grievance pages,
                   including the DPDP notice, breach-notification commitment,
                   grievance-officer contact, and end-of-life statement,
                   written in the app's voice, linked from the composer and
                   from the signup consent checkbox before anyone types.
  P7 AI+Polish     Remix (3 variants, intensity selector, 5/day, 24h shared
                   cache). Weekly side-quest cron. Cover page. Empty states.
                   Skeletons, no spinners. PWA manifest. axe-core in CI on
                   the four core routes. Lighthouse: LCP <1.5s mobile, no
                   CLS, <180KB JS on /list.
  P8 Collaboration Per-item blog + links (§13.1), moderated identically to
     + Import       any other public text, no server-side link unfurling.
                   Smart-paste bulk import via callModel({task:'segment'})
                   with a mandatory preview-before-commit step (§13.2), plus
                   CSV/Excel import with no LLM involved. Shared boards with
                   role-based collaboration — owner/editor/contributor/
                   viewer — direct invites and discoverable "looking for
                   people" join requests (§13.3). Completion/stamping stays
                   entirely on personal list_items; boards never introduce
                   shared completion state, so the P4 stamp code path is
                   untouched by this phase.

CODE STANDARDS
  Server Components by default. Zod at every input boundary. No `any`. All DB
  access through /lib/queries with visibility and review-state rules applied
  there, never at the call site. Typed error results, never throw to the user.
```

---

## 17. Before you run this

1. **Fill the 12 `placeholder: true` catalog entries with real Ashoka names** — see §12.1 for the exact list. This needs you, not a search engine or a model — highest-leverage hour on the project, do it before P1's seed load.
2. Decide now whether `ANON_REVIEW_ENABLED` starts `true` or `false` for launch week, given the paper deadline. Starting `false` and flipping it on once the Sept 30 crunch passes is a reasonable, honest option — the product works fully without it.
3. Write the two-paragraph end-of-life statement for the privacy page (§13) before real user data is collected, not after.
4. W2 return rate above 25% is still the only metric that decides whether to keep building past the first two weeks.
