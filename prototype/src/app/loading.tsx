export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading">
      <div className="mb-2 h-8 w-56 rounded-lg bg-slate-200" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-slate-200" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="h-72 rounded-2xl bg-slate-200 lg:col-span-3" />
        <div className="h-72 rounded-2xl bg-slate-200 lg:col-span-2" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
