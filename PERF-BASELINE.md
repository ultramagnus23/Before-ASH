# PERF-BASELINE.md — P9.0, measured before any optimisation

Every number here was produced by running something, not estimated. Where a
measurement could not be taken in this environment, that is stated as a gap
rather than filled with a plausible figure — the standard `README.md` already
holds for the contrast audit and the Lighthouse section it has honestly
carried as "NOT measured" until now.

Re-measure into `PERF-AFTER.md` using the identical procedure in §7 before
claiming any improvement.

- **Date:** 2 September 2026
- **Commit:** `095cc32`
- **Deployment:** `before-ash.vercel.app`, region `bom1`; Supabase `ap-southeast-1`
- **Perf fixture user:** 60 `list_items` (20 stamped), created by `perf-auth.mjs`

---

## 0. A measurement rule this phase had to learn the hard way

**Any hydration or interaction check in this environment must assert
`document.visibilityState === "visible"` before trusting its result.**

React 19 gates a streamed Suspense boundary's reveal on
`requestAnimationFrame` (the `$RT` / `$RC("B:0","S:0")` pair in the inline
runtime at the end of the served document). Browsers suspend rAF in hidden
and background tabs. The automation pane used here reports
`visibilityState: "hidden"` unless a screenshot forces compositing, so a
page with a `loading.tsx` will appear permanently unhydrated — content
present, nothing interactive, and **no console error at all**.

This produced a completely wrong root-cause diagnosis in `d1d3f97`
(reverted in `095cc32`): three legitimate `loading.tsx` files were deleted
on the theory that they broke hydration in production. They did not. The
same code with a visible tab hydrates fully and add-to-list persists a row.

Practical consequence for the rest of P9: every interaction measurement
below was taken inside a `browser_batch` that screenshots first. Any future
check that skips that is measuring the harness.

---

## 1. Lighthouse — lab, mobile preset, simulated throttling

**Environment caveat, stated up front.** A.1 asks for Lighthouse against the
live `bom1` deployment. That is **not possible from this sandbox**: Node's
outbound connection to `before-ash.vercel.app` times out
(`UND_ERR_CONNECT_TIMEOUT`, attempted `64.29.17.195:443`,
`216.198.79.195:443`), and Lighthouse CLI against the live URL therefore
fails with `NO_FCP` — the page never loads for it. A control run against
`https://example.com` succeeded, so Lighthouse itself works; only the route
to the deployment is blocked. The in-app browser pane reaches production
fine over a different path, which is why §3 (field metrics) *is* live.

So the table below is a **local production build** (`next build && next
start`, port 3200) — same commit, same Next.js 15.5.23, same bundle output
as the deployment. It is the correct comparison surface for
`PERF-AFTER.md` as long as that is measured the same way. It is **not** a
live-network measurement, and does not include Vercel edge or the
bom1→ap-southeast-1 hop.

Lighthouse 12, Edge 141 headless (`CHROME_PATH` → msedge), default mobile
form factor, default simulated throttling, authenticated via a real session
cookie (`--extra-headers`). Verified authenticated: every report's
`finalDisplayedUrl` is the requested route, not a redirect to `/`.

| Route | Score | FCP | **LCP** | **CLS** | **TBT** | TTI | Script transfer | DOM nodes |
|---|---|---|---|---|---|---|---|---|
| `/list` (60 items) | 89 | 1670 ms | **2644 ms** | **0** | **291 ms** | 2808 ms | 113 KB | 1322 |
| `/explore` (60 rows) | 89 | 1831 ms | **2762 ms** | **0** | **238 ms** | 2802 ms | 109 KB | 658 |
| `/feed` | 93 | 1910 ms | **2883 ms** | **0.0007** | **125 ms** | 2887 ms | 109 KB | 114 |
| `/boards` | 96 | 1582 ms | **2389 ms** | **0.0007** | **147 ms** | 2389 ms | 108 KB | 52 |

Against A.4's targets:

- **LCP < 2.5 s — currently MISSED on all four routes** (2389–2883 ms).
  `/boards` is closest at 2389 ms; `/feed` is worst at 2883 ms.
- **CLS < 0.1 — comfortably met** (0 to 0.0007). The `loading.tsx`
  skeletons already reserve layout on the three routes that have them, and
  `next/font` avoids the font-swap shift. There is no CLS problem to fix.
- **JS payload — 108–113 KB transferred per route**, to be beaten in
  `PERF-AFTER.md`.

**Caveat on `/feed` and `/boards`:** the fixture user has no boards and the
feed is near-empty, so those two rows measure close to an empty state. They
are a valid baseline only against an identically-seeded `PERF-AFTER.md` run.
`/list` and `/explore` are the meaningful rows.

---

## 2. Bundle — per-route client JS

From Next's own `app-build-manifest.json` plus real on-disk sizes, gzipped
with `zlib` (`perf-bundle.mjs`). This is exact for "which chunks does this
route load and how big are they". It is **not** the module-level treemap
A.1 asks for — that needs `@next/bundle-analyzer`, which is a new
dependency and rule 5 says ask first. **Open question at the end of this
file.**

| Route | Chunks | Raw | **Gzipped** | Largest route-specific chunk |
|---|---|---|---|---|
| `/list` | 6 | 372.5 KB | **110.8 KB** | `app/list/page` — 21.6 KB raw / **7.0 KB gz** |
| `/feed` | 6 | 357.0 KB | **106.0 KB** | `app/feed/page` — ~6 KB raw / 2.2 KB gz |
| `/explore` | 6 | 356.2 KB | **105.9 KB** | `app/explore/page` — 5.2 KB raw / **2.1 KB gz** |
| `/boards` | 6 | ~356 KB | ~106 KB | `app/boards/page` — small |

Two shared framework chunks dominate every route and are ~93 KB gz of the
~106 KB floor:

| Chunk | Raw | Gzipped |
|---|---|---|
| `4bd1b696-…` (React / Next runtime) | 169.0 KB | 53.1 KB |
| `255-…` (shared app chunk) | 169.6 KB | 45.4 KB |

**So the honest headroom is small.** Route-specific code is 2–7 KB gz. Even
deleting all of `/list`'s own code entirely would cut ~6% of its transfer.
A.4's "measurably smaller `/list` JS payload" is achievable but the
realistic ceiling is single-digit KB, not a halving — worth saying now
rather than discovering it at the end.

### `xlsx` — A.2's suspicion, already resolved

A.2 predicts `xlsx` is "currently taxing every `/list` visit". **It is not.**
It already lives in its own lazily-loaded 402.9 KB chunk
(`2170a4aa.…js`), and that chunk is **not** in `/list`'s eager set —
verified by scanning every chunk for `sheet_to_json`/`XLSX` and
intersecting with the manifest. `app/list/import-panel.tsx:45` already does
`await import("xlsx")` inside the file-change handler, exactly as A.2 asks
for. No work needed; no gain available here.

---

## 3. Field metrics — the live `bom1` deployment

Real navigation through the in-app browser against production, signed in as
the 60-item fixture user, `PerformanceObserver` with `buffered: true`, tab
forced visible per §0.

| Route | LCP | CLS | Long tasks | Long-task total | TTFB | DOM nodes |
|---|---|---|---|---|---|---|
| `/list` | 1964 ms | 0 | 2 | 168 ms | **69 ms** | 1342 |
| `/explore` | 2560 ms | 0 | 0 | 0 ms | **83 ms** | 678 |
| `/feed` | 1244 ms | 0 | 0 | 0 ms | **33 ms** | 134 |
| `/boards` | n/a (no LCP candidate) | 0 | 0 | 0 ms | **33 ms** | 52 |

Asset transfer read ~0 KB because these were repeat visits served from
cache; §2 is the authoritative payload measurement.

**TTFB of 33–83 ms on live is genuinely good** and rules out the server
round trip as the cause of perceived lag. Whatever "laggy" meant, it was
not the origin.

---

## 4. Interaction traces

Measured on production, tab visible.

| Interaction | Result |
|---|---|
| **Typing in `/explore` search** ("chai", 4 chars @ 60 ms) | 258 ms to finish typing, **0 long tasks**, exactly **one** debounced navigation to `?q=chai` |
| **Press-and-hold stamp** (`/list`, 60 rows) | **441 ms** pointerdown → optimistic done, **0 long tasks** |
| **`/list` load, 60 items** | 2 long tasks, 168 ms total (§3) |

Both interactions are clean. The stamp's 441 ms is the deliberate 420 ms
hold from `HOLD_DURATION_MS` plus ~21 ms of overhead — it is the designed
interaction, not latency.

**A.2's keystroke theory does not reproduce.** Search is already debounced
at 350 ms (`app/explore/search-box.tsx`) and fires one navigation per pause,
not per keystroke. Separately, the `callModel` embed path **never executes
in production at all**: `LLM_API_URL` is `http://localhost:11434`, which on
Vercel resolves to the serverless function itself, so every embedding call
fails and `lib/queries/explore.ts` correctly falls back to trigram. There is
no per-keystroke model cost to remove because there is no model call.

Still missing per A.2: an `AbortController` cancelling the in-flight
navigation when a newer keystroke supersedes it. Not currently costing
anything measurable, but correct to add.

---

## 5. Database — `EXPLAIN ANALYZE` on the real queries

Run against the live Supabase instance through the transaction pooler
(`perf-sql.mjs`).

| Query | Execution | Planning |
|---|---|---|
| `/list` — own rows + quest join | **0.54 ms** | 8.63 ms |
| `/list` — `item_posts` for those rows | 0.04 ms | 0.56 ms |
| `/feed` — public+approved page of 21 | **4.39 ms** | 1.37 ms |
| `/boards/[id]` — nested `board_items → item_posts → profiles` | **0.13 ms** | 0.52 ms |
| `quest_open_counts()` | 0.10 ms | 0.25 ms |
| `quest_add_counts()` | 0.12 ms | 0.15 ms |
| `quest_vote_counts()` | 0.06 ms | 0.58 ms |

**The database is not the bottleneck.** Everything is under 5 ms.

A.2 flags the P8 double-nested board embed as "the likeliest offender" — at
current volume it is **0.13 ms** and not worth touching. Sequential scans do
appear, but on tables of 491 quests and 60 list items Postgres is right to
choose them; an index would be slower. **Do not add indexes against these
numbers** — they would be speculative. Re-run this table once real data
exists; the query to watch is `/feed`, already the slowest at 4.39 ms and
the only one that grows unbounded with usage.

Note `/list`'s 8.63 ms *planning* time exceeds its 0.54 ms execution — a
quirk of a cold plan cache on a small table, not a signal.

---

## 6. Where the round trips actually are

The measurements above locate the cost: not SQL, not payload, not the
origin. It is **serial network fan-out to Supabase inside a single render**,
which is the exact class A.2 names first, and the auth call is the worst
offender.

**`supabase.auth.getUser()` appears at 48 call sites.** It is not a local
JWT decode — it is an HTTP round trip to Supabase Auth (that is the point of
`getUser` over `getSession`), and from `bom1` it crosses to
`ap-southeast-1` on every call.

A single signed-in `/list` request currently performs, in order:

1. `middleware.ts` — `getUser()` *(round trip 1)*
2. `app/list/page.tsx` — `getUser()` again *(round trip 2, duplicate)*
3. `app/list/page.tsx` — `profiles` select *(round trip 3, **serial**, and independent of everything in the `Promise.all` that follows)*
4. `Promise.all([...])` — parallel, but containing:
   - `getOwnList` — 1 query
   - `getCategories` — static, no query
   - `isAnonymousPaused` — 1 count query (service-role client, separate connection)
   - `getWeeklyFeaturedQuest` — **2 serial queries** (count, then a `range` that depends on it)

That is ~6 sequential-ish hops where 3 would do. The same shape repeats
elsewhere:

| Location | Issue |
|---|---|
| `lib/queries/boards.ts` → `getBoardDetail` | `boards` select then `board_members` select, **serial and independent** → one `Promise.all` |
| `app/boards/[id]/page.tsx` | `getUser()` → `getBoardDetail()` → `Promise.all([...])`, three sequential stages |
| `app/q/[slug]/page.tsx` | `quests` select then `getUser()`, **independent** → parallelise |
| `lib/queries/list-items.ts` → `getFeedPage` | `currentViewerId()` (a `getUser`) then the feed query, **independent** → parallelise |
| `lib/queries/explore.ts` | `getUser()` in `searchQuests` **and** again in `getOwnedQuestIds` on the `/q` path |

**This is the highest-value target in Part A**, and it is invisible to
Lighthouse-on-localhost (where Supabase latency dominates differently) which
is exactly why it needed the call-site audit rather than a profile.

---

## 7. Reproducing this exactly

```bash
npm run build
# start the production server on :3200, then:
node perf-auth.mjs http://localhost:3200     # seeds a 60-item user, captures cookies
CHROME_PATH="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  node perf-run.mjs http://localhost:3200 after   # writes perf-out/after-summary.json
node perf-bundle.mjs                          # per-route chunk sizes
node perf-sql.mjs                             # EXPLAIN ANALYZE
```

Field metrics (§3) and interaction traces (§4) are taken through the in-app
browser against production, each inside a batch that screenshots first so
the tab is visible — see §0.

---

## 8. Bugs found while measuring (not performance)

**`/feed` shows the viewer their own `private` items.** The 60 fixture rows
are all `visibility: 'private'`, `review_state: 'draft'`; 20 are completed.
All 20 rendered in "What people did" under the fixture user's own handle.

Cause: `getFeedPage` (`lib/queries/list-items.ts`) filters only on
`completed_at is not null` and delegates all visibility filtering to RLS.
RLS grants the owner their own rows via `list_items_select_own`, so a user's
own private items pass.

- **Not a cross-user leak.** `list_items_select_public_approved` still
  blocks everyone else, so non-negotiable #1 holds — verified separately.
- **Still wrong**, and the same gap exists in `getPublicItemsByQuestId`
  (`/q/[slug]`'s "Stamped by campus"). `getPublicItemsByOwnerHandle`
  does it correctly with an explicit `.eq("visibility", "public")`.
- The file's own comment claims the column selection is "a second,
  independent layer" — true for columns, but **row** filtering has no such
  layer. The fix is an explicit `.in("visibility", …)` +
  `.eq("review_state", "approved")` in both functions.

Not fixed here: this is a correctness change, not a performance one, and
belongs in its own commit rather than buried in P9.0.

---

## 9. Honest summary before optimising

- **CLS is already fine** (≈0). Nothing to do; do not claim a win here later.
- **LCP misses 2.5 s on all four routes** under mobile throttling (2389–2883 ms). This is the real target.
- **TBT is worst on `/list`** (291 ms), consistent with 1322 DOM nodes and 60 client-component rows — A.2's re-render theory is the plausible cause and is worth profiling before assuming.
- **The DB is not the problem** (<5 ms) and **the origin is not the problem** (TTFB 33–83 ms).
- **`xlsx` is already lazy** — that A.2 item is closed with no work.
- **Search is already debounced and makes no model call in production** — that A.2 item is largely closed; only `AbortController` remains.
- **Payload headroom is genuinely small** (~2–7 KB gz of route-specific code against a ~106 KB shared floor).
- **The biggest structural win is collapsing duplicate `getUser()` calls and serial round trips** (§6).

### Open question for the next step

`@next/bundle-analyzer` is needed for the module-level treemap A.1 asks for
and is a new devDependency — rule 5 says ask. §2 covers chunk-level sizing
without it. **Confirm whether to add it**, given the headroom in §2 suggests
the treemap may not change what gets done.
