export default function FeedLoading() {
  return (
    <main className="min-h-screen flex justify-center px-4 py-8 sm:py-12">
      <article className="w-full max-w-[72ch] bg-page px-5 sm:px-9 pt-10 rounded-[2px_5px_5px_2px] animate-pulse">
        <div className="h-4 w-40 bg-rule-fine mb-8" />
        <div className="h-9 w-56 bg-rule-fine mb-6" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 w-full bg-rule-fine mb-3" />
        ))}
      </article>
    </main>
  );
}
