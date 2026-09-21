/** Streams the app shell (sidebar + top bar, rendered by the sibling
 * layout.tsx) as soon as it is ready, instead of holding the whole response
 * back until the page's own queries finish.
 *
 * That gap is worth covering here: the database sits in a different region
 * from the people using this, so a round trip costs ~205ms of pure network
 * against ~0.1ms of actual query execution. A page issuing a handful of
 * queries therefore has a latency floor no amount of query tuning removes —
 * but without a loading state, every navigation spends that floor on a
 * completely blank screen. Next.js nests this inside layout.tsx and wraps
 * the page below it in a Suspense boundary automatically.
 *
 * Covers every route in the (app) group that doesn't define its own
 * loading.tsx. The shapes below are deliberately generic (a heading, then
 * cards, then a table) since this one file backs the dashboard, orders,
 * products, sales and problems pages alike. */
function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

function Card({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${className}`} />
  );
}

export default function AppLoading() {
  return (
    // aria-busy + a screen-reader-only status line so the wait is announced
    // rather than being a silent visual-only flicker.
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only" role="status">
        กำลังโหลดข้อมูล
      </span>

      <div className="space-y-2">
        <Line className="h-6 w-56" />
        <Line className="h-4 w-80" />
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="h-24" />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="h-72 lg:col-span-2" />
        <Card className="h-72" />
      </section>

      <Card className="h-64" />
    </div>
  );
}
