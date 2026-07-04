"use client";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 px-6 py-10 text-slate-950">
      <section className="w-full max-w-lg rounded border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-red-700">Platformbeheer</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Pagina kon niet laden</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Probeer opnieuw. Als dit blijft gebeuren, gebruik dan de digest uit de serverlogs.
        </p>
        {error.digest && <p className="mt-2 text-xs text-slate-400">Digest: {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Opnieuw laden
        </button>
      </section>
    </main>
  );
}
