// No spinner, per BUILD-PROMPT.md's banned list — a static skeleton of the
// page shell instead, matching the real layout so there's no layout shift
// when the actual content streams in.
//
// NOTE for anyone debugging this file: a `loading.tsx` makes the route
// stream, and React 19 gates a streamed Suspense boundary's reveal on
// requestAnimationFrame. Browsers suspend rAF in hidden tabs, so in an
// automation pane reporting visibilityState "hidden" the page looks
// permanently unhydrated with no console error. That is the harness, not
// this file — PERF-BASELINE.md §0, where exactly that reading got three of
// these deleted and reverted.
export default function NotificationsLoading() {
  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[72ch] bg-page px-5 sm:px-9 pt-10 rounded-[2px_5px_5px_2px] animate-pulse">
        <div className="h-4 w-40 bg-rule-fine mb-8" />
        <div className="h-9 w-64 bg-rule-fine mb-4" />
        <div className="h-12 w-full bg-rule-fine mb-8" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full bg-rule-fine mb-3" />
        ))}
      </article>
    </main>
  );
}
