// A "use server" file (lib/list-items/actions.ts) may only export async
// functions — Next.js enforces this at build time, and it briefly broke
// every page importing that file when this constant lived there directly
// (found live: the dev server 500'd on /list, /, and anything importing
// add-custom-form.tsx, which imports STALE_PENDING_DAYS from actions.ts).
export const STALE_PENDING_DAYS = 5;
