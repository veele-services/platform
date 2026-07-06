import Link from "next/link";
import { Archive, BarChart3, BookOpen, FilePlus2, Search, Sparkles } from "lucide-react";
import {
  archiveTenantKnowledgebaseArticle,
  getTenantKnowledgebaseDashboard,
} from "@/app/actions/knowledgebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Helpbeheer",
};

type Props = {
  searchParams: Promise<{ q?: string }>;
};

async function archiveAction(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (id) await archiveTenantKnowledgebaseArticle(id);
}

function statusClass(status: string): string {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function TenantKnowledgebaseManagementPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const dashboard = await getTenantKnowledgebaseDashboard(q);
  const articles = dashboard.articles;
  const published = articles.filter((article) => article.status === "published").length;
  const drafts = articles.filter((article) => article.status === "draft").length;

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Handleidingen</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Eigen helpartikelen</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Beheer tenant-interne artikelen die alleen zichtbaar zijn voor deze tenant en dezelfde audience-, module- en permissieregels volgen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/help">Help bekijken</Link>
            </Button>
            {dashboard.state.enabled && dashboard.state.canManage && (
              <Button asChild variant="outline" className="gap-2">
                <Link href="/help/beheer/feedback">
                  <BarChart3 className="h-4 w-4" />
                  Feedback
                </Link>
              </Button>
            )}
            {dashboard.state.enabled && dashboard.state.canManage && (
              <Button asChild className="gap-2">
                <Link href="/help/beheer/nieuw">
                  <FilePlus2 className="h-4 w-4" />
                  Nieuw artikel
                </Link>
              </Button>
            )}
          </div>
        </header>

        {dashboard.state.reason && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">Helpbeheer niet actief</h2>
            <p className="mt-1">{dashboard.state.reason}</p>
            <p className="mt-1">Een tenant admin kan dit activeren via Instellingen, mits de juiste permissies actief zijn.</p>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Eigen artikelen</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{articles.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Gepubliceerd</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{published}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Concepten</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{drafts}</p>
          </div>
        </section>

        <section className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-white p-2 text-cyan-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Editor en preview</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Nieuwe en bestaande artikelen openen in de TipTap-editor met Tip, Let op,
                Voorbeeld, Tabel, Afbeelding, Video, Voorvertoning, Undo en Redo. Publicatie
                blijft tenant-, audience-, module- en permissiegebonden.
              </p>
              {dashboard.state.enabled && dashboard.state.canManage && (
                <Button asChild variant="outline" className="mt-3">
                  <Link href="/help/beheer/nieuw">Artikel in editor maken</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Tenantartikelen</h2>
              <p className="mt-1 text-sm text-slate-500">Concepten, gepubliceerde artikelen en archief voor deze tenant.</p>
            </div>
            <form className="flex w-full gap-2 md:w-[420px]">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Zoeken..."
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm"
                />
              </div>
              <Button type="submit" variant="outline">Zoek</Button>
            </form>
          </div>

          <div className="divide-y divide-slate-200">
            {articles.map((article) => (
              <article key={article.id} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <span className="rounded-md bg-cyan-50 p-2 text-cyan-700">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <Link href={`/help/beheer/${article.id}`} className="font-semibold text-slate-950 hover:underline">
                          {article.title}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">/{article.slug}</p>
                        {article.summary && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{article.summary}</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(article.status)}`}>{article.status}</span>
                      {article.featured && <Badge className="bg-cyan-600">Uitgelicht</Badge>}
                      {article.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 text-sm text-slate-500 lg:text-right">
                    <span>Bijgewerkt: {formatDate(article.updatedAt)}</span>
                    <span>{article.audienceKeys.join(", ") || "Alle doelgroepen"}</span>
                  </div>
                </div>
                {article.status !== "archived" && (
                  <form action={archiveAction} className="mt-3 flex justify-end">
                    <input type="hidden" name="id" value={article.id} />
                    <Button type="submit" variant="outline" size="sm" className="gap-2 text-rose-700">
                      <Archive className="h-4 w-4" />
                      Archiveer
                    </Button>
                  </form>
                )}
              </article>
            ))}
            {articles.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">Nog geen tenantartikelen gevonden.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
