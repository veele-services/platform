import Link from "next/link";
import { CalendarDays, Megaphone } from "lucide-react";
import { listTenantReleases } from "@/app/actions/releases";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Releases",
};

function impactClass(impact: string): string {
  if (impact === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (impact === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  if (impact === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

export default async function TenantReleasesPage() {
  const releases = await listTenantReleases();
  const latest = releases[0] ?? null;

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Support</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Release notes</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Bekijk updates die relevant zijn voor uw actieve modules en rol.
            </p>
          </div>
          {latest && (
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800">
              Laatste: {latest.version}
            </Badge>
          )}
        </header>

        <section className="grid gap-4">
          {releases.map((release) => (
            <Link key={release.id} href={`/releases/${release.slug}`} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-cyan-700" />
                    <h2 className="text-lg font-semibold text-slate-950">{release.version} - {release.title}</h2>
                  </div>
                  {release.summary && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{release.summary}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${impactClass(release.impactLevel)}`}>{release.impactLevel}</span>
                    {release.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(release.publishedAt)}
                </span>
              </div>
            </Link>
          ))}
          {releases.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Geen release notes zichtbaar voor uw modules.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
