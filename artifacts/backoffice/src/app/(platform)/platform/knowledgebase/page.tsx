import Link from "next/link";
import { Archive, BarChart3, BookOpen, FilePlus2, HelpCircle, Tags } from "lucide-react";
import {
  archiveKnowledgebaseArticle,
  listKnowledgebaseManagementArticles,
} from "@/app/actions/knowledgebase";
import { Button } from "@/components/ui/button";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
import { Badge } from "@/components/ui/badge";
import { PlatformContentPreviewPanel } from "@/components/platform/PlatformContentPreviewPanel";
import { KnowledgebaseAutocompleteSearch } from "@/components/knowledgebase/KnowledgebaseAutocompleteSearch";
import { getPlatformContentPreviewModel } from "@/lib/platform-content-preview";

export const metadata = {
  title: "Knowledgebase",
};

type Props = {
  searchParams: Promise<{
    q?: string;
    previewMode?: string | string[];
    previewTenantId?: string | string[];
    previewModuleKeys?: string | string[];
  }>;
};

async function archiveArticleAction(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (id) await archiveKnowledgebaseArticle(id);
}

function statusClass(status: string): string {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const AUDIENCE_LABELS: Record<string, string> = {
  platform_admin: "Platform admin",
  support: "Support",
  tenant_admin: "Tenant admin",
  tenant_management: "Management",
  tenant_planning: "Planning",
  tenant_administration: "Administratie",
  tenant_personnel: "Personeel",
  tenant_customer: "Klant",
};

function formatAudienceKeys(values: string[]): string {
  if (values.length === 0) return "Alle doelgroepen";
  return values.map((value) => AUDIENCE_LABELS[value] ?? value.replace(/_/g, " ")).join(", ");
}

function formatModuleKeys(values: string[]): string {
  if (values.length === 0) return "Alle modules";
  return values.map((value) => value.replace(/_/g, " ")).join(", ");
}

export default async function PlatformKnowledgebasePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const { q } = resolvedSearchParams;
  const [articles, previewModel] = await Promise.all([
    listKnowledgebaseManagementArticles(q),
    getPlatformContentPreviewModel("knowledgebase", resolvedSearchParams),
  ]);
  const published = articles.filter((article) => article.status === "published").length;
  const drafts = articles.filter((article) => article.status === "draft").length;
  const archived = articles.filter((article) => article.status === "archived").length;
  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Platformbeheer</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Knowledgebase</h1>
              <ResolvedFeatureHelp surface="platform" featureKey="platform.knowledgebase" moduleKey="knowledgebase" />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Beheer globale handleidingen met doelgroep-, module- en permissiescope voor backoffice, personeelsapp en klantportaal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/platform/knowledgebase/categories">
                <Tags className="h-4 w-4" />
                Categorieen
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/platform/knowledgebase/tooltips">
                <HelpCircle className="h-4 w-4" />
                Tooltips
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/platform/knowledgebase/feedback">
                <BarChart3 className="h-4 w-4" />
                Feedback
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/platform/knowledgebase/articles/new">
                <FilePlus2 className="h-4 w-4" />
                Nieuw artikel
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Gepubliceerd</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{published}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Concepten</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{drafts}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Archief</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{archived}</p>
          </div>
        </section>

        <PlatformContentPreviewPanel
          resource="knowledgebase"
          model={previewModel}
          preserveParams={{ q }}
        />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Artikelen</h2>
              <p className="mt-1 text-sm text-slate-500">Zoek op titel, inhoud, zoekwoorden of categorie.</p>
            </div>
            <KnowledgebaseAutocompleteSearch
              action="/platform/knowledgebase"
              endpoint="/api/platform/knowledgebase/search-suggestions"
              defaultValue={q ?? ""}
              placeholder="Zoek artikel, keyword of module..."
              className="w-full md:w-[520px]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Artikel</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Categorie</th>
                  <th className="px-4 py-3 font-semibold">Audience</th>
                  <th className="px-4 py-3 font-semibold">Modules</th>
                  <th className="px-4 py-3 font-semibold">Bijgewerkt</th>
                  <th className="px-4 py-3 text-right font-semibold">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {articles.map((article) => (
                  <tr key={article.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-md bg-cyan-50 p-2 text-cyan-700">
                          <BookOpen className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <Link href={`/platform/knowledgebase/articles/${article.id}`} className="font-semibold text-slate-950 hover:underline">
                            {article.title}
                          </Link>
                          <p className="mt-1 max-w-xl truncate text-xs text-slate-500">/{article.slug}</p>
                          {article.summary && <p className="mt-1 max-w-xl text-sm text-slate-600">{article.summary}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(article.status)}`}>
                        {article.status}
                      </span>
                      {article.featured && <Badge className="ml-2 bg-cyan-600">Uitgelicht</Badge>}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{article.category?.name ?? "-"}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{formatAudienceKeys(article.audienceKeys)}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{formatModuleKeys(article.moduleKeys)}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(article.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/platform/knowledgebase/articles/${article.id}`}>Bewerken</Link>
                        </Button>
                        {article.status !== "archived" && (
                          <form action={archiveArticleAction}>
                            <input type="hidden" name="id" value={article.id} />
                            <Button type="submit" variant="outline" size="sm" className="gap-1 text-rose-700">
                              <Archive className="h-3.5 w-3.5" />
                              Archiveer
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {articles.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="font-medium text-slate-900">Geen artikelen gevonden.</p>
              <p className="mt-1 text-sm text-slate-500">Maak het eerste knowledgebase-artikel aan of pas de zoekopdracht aan.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
