# Before ASH — Work Prompt v3 (design depth + content depth)

Paste the fenced block below into a fresh Claude Code session opened at `before-ash/`.
Read `AUDIT-2026-08.md` and `BUILD-PROMPT.md` before touching anything.

**One decision is required from you first.** Section 2.3 of the audit asks whether this stays an
Ashoka-only product, becomes a universal bucket-list product, or ships Ashoka-first on a universal
schema. The prompt below assumes **(C) — Ashoka now, architected for universal**. If you want (A)
or (B), edit Phase 4 before pasting.

---

```
Read AUDIT-2026-08.md and BUILD-PROMPT.md in full before writing any code. AUDIT-2026-08.md
is the findings document this work plan comes from; BUILD-PROMPT.md is the standing product
constitution and its locked decisions still hold except where this prompt overrides them
explicitly.

## The single most important instruction

BUILD-PROMPT.md §2-3 locks a dry, unexcited tone and bans confetti, streaks, badges, points,
mascots, emoji, spinners, exclamation marks, glassmorphism, gradient text, and identical card
grids. That ban is NOT lifted. The brief is to make this product feel alive, algorithmic,
surprising and modern WITHOUT any of those things.

The existing press-and-hold stamp (app/list/row.tsx + the .stamp-* rules in app/globals.css)
is the proof that this is possible: it is genuinely delightful and completely dry. Every new
piece of design must clear that bar. If a proposed element would feel at home in a habit-tracker
app, it is wrong for this one.

"Algorithmic" here means the product visibly thinks - ranking, clustering, semantic neighbours,
time-and-season awareness, "three people also have this open" - never engagement mechanics.

## Ground truth about the current state (verified 2026-08-23, do not re-derive)

- quests: 491 rows. ALL 491 have a NULL embedding.
- profiles: 1 row. list_items, item_posts, boards, board_members, board_items, connections,
  reactions, reports, blocks, review_queue: ALL ZERO rows.
- 12 catalog items still have placeholder:true in seed-quests.json.
- lib/queries/explore.ts caps browsing at 200 rows while the page claims 491.
- difficulty, group_size, locale and spice are stored and selected but never rendered anywhere.
- /q/[slug] and /u/[handle] render without AppNav.

Never seed fake users, fake completions, fake reactions or fake connections. It would break
BUILD-PROMPT.md §8 and the product's credibility. Cold start is solved editorially and
structurally, not by fabrication.

## Working rules

- Preserve every accessibility decision already made and the comments explaining them. The
  contrast values in app/globals.css were derived from real WCAG measurements; do not "clean
  up" --color-ink-faint, --color-error, --color-error-on-dark or AppNav's text-foil-dim.
- All new colour, type, spacing and easing must come from the @theme tokens in app/globals.css.
  If a new token is genuinely needed, add it there with a comment saying why, never inline.
- Server components by default. Add "use client" only where an interaction actually requires it.
- Respect prefers-reduced-motion for every new animation, following the existing pattern where
  functional timing survives and decorative motion does not.
- npm run typecheck and npm test must pass at the end of every phase. The blocking e2e tests
  (add-to-list, mark-done) must still pass - they are the two flows BUILD-PROMPT.md §4 says
  can never break.
- Work phase by phase. After each phase, stop and report what changed and what you verified.

## Phase 1 - Make the existing promises true (do this first, it is the cheapest win)

1. Backfill embeddings for all 491 quests. scripts/seed.ts already has embedForSeed(); write
   scripts/backfill-embeddings.ts that fills only NULL rows, batches, retries, is safely
   re-runnable, and reports progress. Verify against LLM_API_URL before running the full set.
   If the endpoint is unreachable, stop and report - do not silently skip, because silent
   skipping is exactly how this state was reached.
2. After backfill, verify search_quests_semantic actually returns sensible neighbours for three
   sentence-length queries. Show me the results.
3. Remove the 200-row cap in lib/queries/explore.ts. Replace with real pagination or cursor
   loading on /explore so all 491 are reachable.
4. Add AppNav to /q/[slug] and /u/[handle].
5. Fix the a11y gaps: aria-pressed on Link elements in app/explore/filters.tsx, the
   window.confirm() keyboard path for stamping in app/list/row.tsx, the toast live region, and
   the unlabelled visibility select.

## Phase 2 - Make the catalog algorithmic

The catalog has four unused dimensions. Use them.

1. Render difficulty, group_size, locale and spice on catalog rows and on /q/[slug], in the
   passport register - mono micro-type, rules, marks. Not chips, not pills, not coloured badges.
   Look at how a real passport prints visa conditions and endorsements.
2. Make them real filters on /explore alongside the existing category filter, still as links
   with query params so the no-JS path survives.
3. Add browse affordances that reward wandering: a shuffle/"deal me something" action, a
   "one free afternoon" style constraint picker (time available + who you are with + where you
   are), and a semantic "more like this" on /q/[slug] driven by the embeddings from Phase 1.
4. Rank the default /explore ordering instead of ORDER BY id. Combine: how many people have it
   open, seasonality/time-of-year fit, difficulty spread, and unstamped-by-you. Keep the ranking
   function in one readable, commented, testable module in lib/ranking/ with unit tests. It must
   be explainable in one sentence per signal.
5. Show the thinking. When ranking or semantic search changed the order, say so in one dry mono
   line ("Sorted by what fits this week." / "Closest in meaning, not in words."). This is where
   "algorithmic" becomes visible rather than merely true.

## Phase 3 - Design depth: seven pages, one material system

Finding A in the audit: every route is currently the same cream page. Fix that without
fragmenting the system.

1. Establish the passport page TYPES as reusable layout primitives - a data page (/list), an
   index page (/explore), an endorsement/wire page (/feed), a visa page (/q/[slug]), a bearer
   page (/u/[handle]), a shared-book page (/boards). Each gets its own plate structure, eyebrow
   treatment, rule weights, margin ratios and paper stock variant, all built from the same
   tokens. Different pages of one document, not different documents.
2. Give the stamp a consequence (finding E). Options to design and propose before building:
   the page visibly filling, a passport-object view of all stamps together, the MRZ gaining
   meaning as it fills, category ink accumulating on the cover. No counters, no progress bars,
   no percentages, no milestones. Bring me two or three directions before you implement one.
3. Motion pass. --ease-passport is defined and almost unused. Add restrained, material motion:
   page-turn transitions between routes, list rows settling in, the paper responding to pointer,
   the guilloche shifting subtly on scroll. Everything must degrade correctly under
   prefers-reduced-motion. If a motion cannot be described as something paper or ink does, cut it.
4. Rebuild the cover page /. Today it is a headline, a paragraph, a field, and a ticker that
   renders empty because there are no completions. It must be compelling with zero data in the
   database - that is the actual current condition and the actual first impression.
5. Decide light/dark deliberately. Either commit to the fixed dark chrome and document why, or
   build a proper light register from the existing page/ink tokens. Not an accident either way.

## Phase 4 - Content depth and the cold start

This is the part that decides whether the product is useful on day one.

1. The 12 placeholder items need real Ashoka names and CANNOT be filled by a model or a web
   search. Produce a single markdown file, PLACEHOLDERS-TO-FILL.md, listing each of the 12 with
   its ID, current generic phrasing, and the exact blank a campus insider must fill. Then stop
   and hand it to me. Do not guess a building name.
2. Add a second content layer to the catalog schema, designed so it would work for a universal
   bucket list, not only a campus one: a short description of what the thing actually involves,
   rough time cost, rough money cost, best season or time of day, prerequisites, and related
   item IDs. Write the migration, update db/schema.ts, seed-quests.json and scripts/seed.ts.
   Then write this layer for the catalog, category by category, in the locked tone - dry, second
   person, short, no exclamation marks, no em dashes. Ashoka-specific facts you cannot verify go
   into PLACEHOLDERS-TO-FILL.md rather than being invented.
3. Ship curated official boards. The boards feature is fully built and has zero rows. Create
   8-12 editorial boards over the existing 491 items - "your first week", "one free afternoon",
   "monsoon only", "do this alone", "before finals", "the last month", "costs nothing",
   "you will need three people". These are real curation, owned by an official account, and they
   are what a new user sees instead of an empty product.
4. Rebuild every empty state as a first-run experience (finding B). /feed, /boards, /list,
   /q/[slug] and /u/[handle] each need a state that is genuinely worth looking at with zero rows
   and that offers a specific next action. Design these as intentional pages, not as fallback
   paragraphs. They are currently what 100% of visitors see on five of seven surfaces.
5. Add seasonality/time-awareness to the catalog data so Phase 2's ranking has a real signal to
   use - monsoon, exam weeks, semester start, the last month before graduation.

## Phase 5 - Verify

- npm run typecheck, npm test, npm run test:e2e all green.
- The axe-core accessibility spec passes on every route including the new ones.
- Walk every route in the browser preview at mobile, tablet and desktop widths, in the empty-data
  state and with a small amount of real data, and show me screenshots.
- Confirm no private item, no note field, and no owner_id on an anonymous item appears in any
  public response - the serializer tests in tests/unit/serializers.test.ts still cover this.

## What to report back

After each phase: what changed, what you verified and how, what you could not do and why, and
anything in BUILD-PROMPT.md that this work now contradicts and should be amended.
```
