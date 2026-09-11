# PERF-AFTER.md — what the optimisation pass changed, and what could be measured

Companion to `PERF-BASELINE.md`. Same rule as that document: every number
here was produced by running something, and where a measurement could not be
taken it is recorded as a gap rather than filled in with a plausible figure.

- **Date:** 11 September 2026
- **Baseline commit:** `095cc32` (measured in `PERF-BASELINE.md`)
- **This commit:** the perf pass on top of `6069992`
- **Perf fixture user:** 60 `list_items` (20 stamped), created by `perf-auth.mjs`

---

## 0. The headline, stated honestly up front

**The code changes are real and verifiable by reading the diff. The
performance claim is not measurable on this machine, and this document does
not make one.**

`PERF-BASELINE.md` §6 named serial auth fan-out as "the highest-value target
in Part A". That was a reasonable read of the call-site audit. But §3 of the
same document had already measured live TTFB at **33–83 ms** and concluded,
in its own words, that this "rules out the server round trip as the cause of
perceived lag."

Those two findings are in tension, and §3 is the one backed by a
measurement. The fan-out work below is correct — it removes round trips that
had no reason to be sequential — but it is a **correctness-and-architecture
improvement with an unproven performance benefit**, not the fix for a
measured problem. Anyone reading this later should not go looking for a
user-visible speedup that the baseline's own numbers say was never available.

---

## 1. Why no before/after wall-clock number appears here

An A/B was attempted properly: the changes were stashed, the app rebuilt,
and TTFB measured against the same server on the same machine
(`perf-ttfb.mjs`, 12 samples per route after 3 warmups, median reported).

Then the **identical build was measured twice** to establish run-to-run
variance:

| Route | before (run 1) | before (run 2, same build) | drift |
|---|---|---|---|
| `/list` | 217 ms | 228 ms | +11 ms |
| `/feed` | 235 ms | 153 ms | **−82 ms** |
| `/explore` | 292 ms | 223 ms | **−69 ms** |
| `/boards` | 257 ms | 306 ms | +49 ms |
| `/tonight` | 259 ms | 147 ms | **−112 ms** |
| `/outings` | 234 ms | 224 ms | −10 ms |

**Two runs of the same code differ by up to 112 ms.** Individual samples
ranged as high as 9411 ms. This machine reaches Supabase `ap-southeast-1`
over a consumer connection, so wall-clock here measures the network, not the
code, and no honest before/after conclusion can be drawn from it.

The measured "after" figures are in `perf-out/after-ttfb.json` and the two
baselines in `perf-out/before-ttfb.json` and `perf-out/before2-ttfb.json`.
They are kept as evidence of the noise floor, not as a result.

**Lighthouse was not re-run.** The first attempt was invalidated by a
sequencing mistake — `next build` was rewriting `.next` while Lighthouse was
measuring the server serving it — and those partial outputs were deleted
rather than reported. Re-running it would have measured the same
network-dominated localhost that §1 of the baseline already flagged as a
poor proxy for `bom1`.

### What to measure instead, on production

The only environment where this change can show itself is the deployed one,
where `bom1 → ap-southeast-1` latency is stable and each removed round trip
is a consistent ~40–60 ms. The procedure in `PERF-BASELINE.md` §7 and §3
still applies; run it against `before-ash.vercel.app` from a machine that
can reach it, with the tab forced visible per §0.

---

## 2. What actually changed

### 2.1 One auth round trip per request instead of several

`lib/auth/current-user.ts` wraps `getUser()` in React's `cache()`, which is
per-request and not global — two people's requests never share a result.

`supabase.auth.getUser()` is an HTTP round trip to Supabase Auth, not a local
JWT decode; that is the point of it over `getSession()`, and this change does
**not** weaken that verification. It de-duplicates the check within a single
render.

Auth round trips per render, counted from the call graph:

| Route | before | after |
|---|---|---|
| `/explore` | 3 — middleware, `searchQuests`, `getOwnedQuestIds` | 2 |
| `/q/[slug]` | 3 — middleware, page, `getPublicItemsByQuestId` | 2 |
| `/list` | 2 — middleware, page | 2 |
| `/feed` | 2 — middleware, `getFeedPage` | 2 |

Middleware runs in a separate runtime from the render, so its call cannot be
folded into the render's cache. Collapsing that one would mean trusting the
cookie in the render, which is the trade `getUser` exists to refuse.

**Raw `supabase.auth.getUser()` in render paths: 0.** The 43 remaining call
sites are Server Actions, route handlers, the admin guard and middleware —
each its own request, where a single call is already correct.

### 2.2 Independent queries no longer wait on each other

Each of these was a serial pair where neither side read the other's result:

| Location | Was |
|---|---|
| `app/list/page.tsx` | profile select sat alone between the auth call and a `Promise.all` it did not depend on |
| `app/q/[slug]/page.tsx` | quest lookup, then auth call — the page's only essential query queued behind auth |
| `lib/queries/boards.ts` → `getBoardDetail` | board select, then membership select, both keyed on ids already held |
| `lib/queries/list-items.ts` → `getFeedPage` | viewer lookup, then the feed query; the viewer id is only used to mark own-rows *after* results return |
| `lib/queries/list-items.ts` → `getPublicItemsByOwnerHandle`, `getPublicItemsByQuestId` | same shape |

One deliberate trade in `getBoardDetail`: the membership query now runs even
when the board turns out not to exist, costing one wasted round trip on a
404 and saving one on every successful render.

### 2.3 `loading.tsx` for ten more routes

Added for `/boards`, `/boards/[id]`, `/connections`, `/u/[handle]`,
`/q/[slug]`, `/notifications`, `/tonight`, `/outings`, `/outings/[id]`,
`/submit`. Static skeletons matching each page's shell — no spinners, per
the banned list.

Every one carries a comment pointing at `PERF-BASELINE.md` §0, because a
`loading.tsx` makes a route stream, React 19 gates a streamed boundary's
reveal on `requestAnimationFrame`, and browsers suspend rAF in hidden tabs.
That reading is what got three of these deleted and reverted in `d1d3f97` /
`095cc32`. The comment is there so the next person debugging a "dead" page
checks `document.visibilityState` before deleting anything.

### 2.4 Search: the real defect was not the one in the spec

`PERF-BASELINE.md` §4 lists "an `AbortController` cancelling the in-flight
navigation when a newer keystroke supersedes it" as still missing.

**`AbortController` does not apply here.** Search is a server navigation via
`router.push`, not a `fetch` — there is no request object to attach a signal
to, `router.push` accepts none, and React supersedes transitions itself.
There is no fetch-based search anywhere in the app (`app/api/` has no search
route).

Two real defects were fixed instead:

- **The debounce had no unmount cleanup.** Type, navigate away within 350 ms,
  and a `router.push` fires from a component that no longer exists, yanking
  the reader back to `/explore`. That is the cancellation the item was
  reaching for.
- **Redundant navigation on an unchanged query.** Blurring the field or
  pressing Enter without editing cost a full RSC round trip and a re-render
  of the whole index for no change.

---

## 3. Verification

Not performance, but the pass touched 26 files and none of it is worth
anything if it broke behaviour:

- `tsc --noEmit` — clean
- `eslint .` — clean
- `vitest run` — **94 passed**, 9 files
- `next build` — compiles, all routes present

---

## 4. Still open

- **The production measurement in §1.** Nothing here substitutes for it.
- **`PERF-BASELINE.md` §2's bundle numbers were not re-measured.** No
  dependency changed in this pass, and the added `loading.tsx` files are
  server components that ship no client JS, so the per-route client bundles
  should be unchanged — but "should be" is not a measurement, and this is
  recorded as a gap rather than asserted.
