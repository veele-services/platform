import Link from "next/link";
import { Archive, FilePlus2, Megaphone, Save, Tags } from "lucide-react";
import {
  archiveRelease,
  listPlatformReleases,
  listReleaseEditorOptions,
  saveReleaseCategoryFromForm,
} from "@/app/actions/releases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";

export const metadata = {
  title: "Releases",
};

async function categoryAction(formData: FormData): Promise<void> {
  "use server";
  await saveReleaseCategoryFromForm(formData);
}

async function archiveAction(formData: FormData): Promise<void> {
  "use server";
  await archiveRelease(formData);
}

function statusClass(status: string): string {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function impactClass(impact: string): string {
  if (impact === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (impact === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  if (impact === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function PlatformReleasesPage() {
  const [releases, options] = await Promise.all([
    listPlatformReleases(),
    listReleaseEditorOptions(),
  ]);
  const published = releases.filter((release) => release.status === "published").length;
  const drafts = releases.filter((release) => release.status === "draft").length;

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Platformbeheer</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Releasebeheer</h1>
              <ResolvedFeatureHelp surface="platform" featureKey="platform.releases" moduleKey="releases" />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Publiceer versienotes per audience, module en surface. Highlights tonen als gele balk en zijn per gebruiker dismissable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{published} gepubliceerd</Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">{drafts} concepten</Badge>
            <Button asChild className="gap-2">
              <Link href="/platform/releases/new">
                <FilePlus2 className="h-4 w-4" />
                Nieuwe release
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-950">Versienotes</h2>
              <p className="mt-1 text-sm text-slate-500">Alle concepten, gepubliceerde releases en archiefitems.</p>
            </div>
            <div className="divide-y divide-slate-200">
              {releases.map((release) => (
                <article key={release.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <Link href={`/platform/releases/${release.slug}`} className="text-lg font-semibold text-slate-950 hover:underline">
                        {release.version} - {release.title}
                      </Link>
                      {release.summary && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{release.summary}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(release.status)}`}>{release.status}</span>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${impactClass(release.impactLevel)}`}>{release.impactLevel}</span>
                        {release.featured && <Badge className="bg-cyan-600">Uitgelicht</Badge>}
                        {release.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 text-sm text-slate-500 lg:text-right">
                      <span>Publicatie: {formatDate(release.publishedAt)}</span>
                      <span>{release.items.length} items</span>
                      <span>{release.roadmapItems.length} roadmaplinks</span>
                    </div>
                  </div>
                  {release.status !== "archived" && (
                    <form action={archiveAction} className="mt-3 flex justify-end">
                      <input type="hidden" name="id" value={release.id} />
                      <Button type="submit" variant="outline" size="sm" className="gap-2 text-rose-700">
                        <Archive className="h-4 w-4" />
                        Archiveer
                      </Button>
                    </form>
                  )}
                </article>
              ))}
              {releases.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-500">Nog geen releases aangemaakt.</div>
              )}
            </div>
          </div>

          <aside className="grid gap-4 self-start">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Tags className="h-5 w-5 text-cyan-700" />
                <h2 className="text-lg font-semibold text-slate-950">Categorieen</h2>
              </div>
              <form action={categoryAction} className="mt-4 grid gap-3">
                <input name="name" required placeholder="Naam" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
                <input name="slug" placeholder="slug" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
                <select name="moduleKey" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="">Geen module</option>
                  {options.modules.map((module) => (
                    <option key={module.key} value={module.key}>{module.name}</option>
                  ))}
                </select>
                <input name="sortOrder" type="number" defaultValue={0} className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
                <label className="flex items-center gap-2 text-sm">
                  <input name="isActive" type="checkbox" defaultChecked />
                  Actief
                </label>
                <Button type="submit" className="gap-2">
                  <Save className="h-4 w-4" />
                  Categorie opslaan
                </Button>
              </form>
              <div className="mt-4 grid gap-2">
                {options.categories.map((category) => (
                  <div key={category.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-950">{category.name}</p>
                    <p className="text-xs text-slate-500">{category.slug} {category.moduleKey ? `- ${category.moduleKey}` : ""}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-700" />
                <h2 className="text-lg font-semibold text-slate-950">Highlights</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Maak highlights aan op de releasedetailpagina. Een highlight wordt alleen getoond als de release gepubliceerd is en de audience/module matcht.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
