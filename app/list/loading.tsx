// No spinner, per BUILD-PROMPT.md's banned list — a static skeleton of the
// page shell instead, matching the real layout so there's no layout shift
// when the actual content streams in.
export default function ListLoading() {
  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[72ch] bg-page px-5 sm:px-9 pt-10 rounded-[2px_5px_5px_2px] animate-pulse">
        <div className="h-4 w-40 bg-rule-fine mb-8" />
        <div className="h-9 w-64 bg-rule-fine mb-4" />
        <div className="h-16 w-full bg-rule-fine mb-8" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full bg-rule-fine mb-3" />
        ))}
      </article>
    </main>
  );
}
