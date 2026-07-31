import Link from "next/link";
import { CalendarDays, Megaphone } from "lucide-react";
import { listPersonnelReleases } from "@/actions/releases";
import { OfflineContentNotice } from "@/components/OfflineContentNotice";
import { notFound } from "next/navigation";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";

export const metadata = {
  title: "Release notes",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function impactLabel(value: string): string {
  if (value === "critical") return "Kritiek";
  if (value === "high") return "Hoog";
  if (value === "low") return "Laag";
  return "Gemiddeld";
}

export default async function PersonnelReleasesPage() {
  if (!(await requireCurrentPortalModule("releases"))) notFound();
  const releases = await listPersonnelReleases();
  const latest = releases[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-0">
      <OfflineContentNotice message="Je bent offline. Eerder geopende release notes blijven beschikbaar; media en bijlagen openen weer zodra je online bent." />

      <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-accent)" }}>
          Releases
        </p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-primary)" }}>
          Nieuw in de personeelsapp
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Updates voor uw planning, opdrachten, uren, meldingen en andere actieve appfuncties.
        </p>
        {latest && (
          <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Laatste release</p>
            <h2 className="mt-2 font-semibold" style={{ color: "var(--color-primary)" }}>
              {latest.version} - {latest.title}
            </h2>
            {latest.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{latest.summary}</p>}
            <Link href={`/releases/${latest.slug}`} className="mt-3 inline-flex text-sm font-semibold text-cyan-700">
              Lees meer
            </Link>
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-3">
        {releases.map((release) => (
          <Link
            key={release.id}
            href={`/releases/${release.slug}`}
            className="block rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "#E2E8F0" }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                  <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
                    {release.version} - {release.title}
                  </h2>
                </div>
                {release.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{release.summary}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
                    {impactLabel(release.impactLevel)}
                  </span>
                  {release.moduleKeys.map((moduleKey) => (
                    <span key={moduleKey} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">
                      {moduleKey}
                    </span>
                  ))}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500">
                <CalendarDays className="h-4 w-4" />
                {formatDate(release.publishedAt)}
              </span>
            </div>
          </Link>
        ))}

        {releases.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
            Er zijn nog geen release notes zichtbaar voor uw app.
          </div>
        )}
      </section>
    </main>
  );
}
