export default function Loading() {
  return <div role="status" aria-label="Loading cake availability" className="animate-pulse space-y-5 motion-reduce:animate-none"><div className="h-10 w-64 rounded-lg bg-a-canvas" /><div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-xl bg-a-canvas" />)}</div><div className="h-12 rounded-lg bg-a-canvas" /><div className="h-72 rounded-xl bg-a-canvas" /><span className="sr-only">Loading cake availability…</span></div>;
}
