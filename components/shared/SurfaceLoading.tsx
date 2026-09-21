export function SurfaceLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-4 w-28 animate-pulse rounded bg-s-cream-deep" />
      <div className="h-12 w-3/4 animate-pulse rounded bg-s-cream-deep" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-s border border-s-line bg-s-cream-deep"
          />
        ))}
      </div>
    </div>
  );
}
