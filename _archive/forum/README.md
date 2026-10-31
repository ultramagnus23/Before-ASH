# Archived forum features

Parked for the official Ashoka launch. Nothing here is built or routed
(`_archive` is excluded in tsconfig.json). Database tables, RLS and
migrations are untouched, so restoring is just moving files back:

- `app/boards`, `app/feed`  -> `app/`
- `lib/boards`, `lib/feed`, `lib/reactions`, `lib/queries/boards.ts` -> `lib/`
- re-add the "Wire" and "Boards" links in `app/app-nav.tsx`
