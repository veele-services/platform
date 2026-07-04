export default function PlatformLoading() {
  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="h-24 animate-pulse rounded border border-slate-200 bg-white" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 animate-pulse rounded border border-slate-200 bg-white" />
          <div className="h-28 animate-pulse rounded border border-slate-200 bg-white" />
          <div className="h-28 animate-pulse rounded border border-slate-200 bg-white" />
        </div>
        <div className="h-80 animate-pulse rounded border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
