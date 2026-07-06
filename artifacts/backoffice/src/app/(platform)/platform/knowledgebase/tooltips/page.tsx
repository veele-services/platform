import Link from "next/link";
import { Archive, ArrowLeft, HelpCircle, Save } from "lucide-react";
import {
  archiveKnowledgebaseTooltip,
  listKnowledgebaseEditorOptions,
  listKnowledgebaseTooltipsForManagement,
  saveKnowledgebaseTooltipFromForm,
  type KnowledgebaseEditorOptions,
  type KnowledgebaseTooltipRow,
} from "@/app/actions/knowledgebase";
import { FeatureHelp } from "@/components/knowledgebase/FeatureHelp";
import { PlatformContentPreviewPanel } from "@/components/platform/PlatformContentPreviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlatformContentPreviewModel } from "@/lib/platform-content-preview";

export const metadata = {
  title: "Knowledgebase tooltips",
};

type Props = {
  searchParams: Promise<{
    previewMode?: string | string[];
    previewTenantId?: string | string[];
    previewModuleKeys?: string | string[];
  }>;
};

async function saveTooltipAction(formData: FormData): Promise<void> {
  "use server";
  await saveKnowledgebaseTooltipFromForm(formData);
}

async function archiveTooltipAction(formData: FormData): Promise<void> {
  "use server";
  await archiveKnowledgebaseTooltip(formData);
}

function statusClass(status: string): string {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function relatedArticlePreview(tooltip: KnowledgebaseTooltipRow | null, options: KnowledgebaseEditorOptions) {
  const ids = new Set(tooltip?.relatedArticleIds ?? []);
  return options.relatedArticles
    .filter((article) => ids.has(article.id))
    .map((article) => ({
      title: article.title,
      href: `/platform/knowledgebase/articles/${article.id}`,
    }));
}

function TooltipForm({
  tooltip,
  options,
}: {
  tooltip: KnowledgebaseTooltipRow | null;
  options: KnowledgebaseEditorOptions;
}) {
  const selectedAudiences = new Set(tooltip?.audienceKeys ?? []);
  const selectedRelated = new Set(tooltip?.relatedArticleIds ?? []);
  const articleHref = tooltip?.articleId ? `/platform/knowledgebase/articles/${tooltip.articleId}` : null;

  return (
    <form action={saveTooltipAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {tooltip && <input type="hidden" name="id" value={tooltip.id} />}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-semibold text-slate-950">{tooltip ? tooltip.title : "Nieuwe tooltip"}</h2>
            {tooltip && (
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(tooltip.status)}`}>
                {tooltip.status}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Korte contextuele uitleg met een veilige link naar het gekoppelde knowledgebase-artikel.
          </p>
        </div>
        <FeatureHelp
          title={tooltip?.title ?? "Voorbeeld tooltip"}
          description={tooltip?.description ?? "Korte uitleg verschijnt bij hover en opent bij klikken of tappen met verdieping."}
          articleHref={articleHref}
          relatedArticles={relatedArticlePreview(tooltip, options)}
          placement={(tooltip?.placement as "top" | "right" | "bottom" | "left" | undefined) ?? "top"}
          showRelatedArticles={tooltip?.showRelatedArticles ?? true}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Stabiele key
              <input
                name="stableKey"
                required
                defaultValue={tooltip?.stableKey ?? ""}
                placeholder="assignments.new.help"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titel
              <input
                name="title"
                required
                defaultValue={tooltip?.title ?? ""}
                placeholder="Nieuwe werkbon"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Korte uitleg
            <textarea
              name="description"
              required
              defaultValue={tooltip?.description ?? ""}
              placeholder="Leg in een zin uit wat deze functie doet en wanneer iemand deze gebruikt."
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal leading-6"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Primair artikel
              <select
                name="articleId"
                defaultValue={tooltip?.articleId ?? ""}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="">Geen artikel</option>
                {options.relatedArticles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Module
              <select
                name="moduleKey"
                defaultValue={tooltip?.moduleKey ?? ""}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="">Geen module-scope</option>
                {options.modules.map((module) => (
                  <option key={module.key} value={module.key}>
                    {module.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Permissie
              <select
                name="permissionKey"
                defaultValue={tooltip?.permissionKey ?? ""}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="">Geen permissie-scope</option>
                {options.permissions.map((permission) => (
                  <option key={permission.key} value={permission.key}>
                    {permission.key}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select
                name="status"
                defaultValue={tooltip?.status ?? "draft"}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="draft">Concept</option>
                <option value="published">Gepubliceerd</option>
                <option value="archived">Gearchiveerd</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tooltippositie
              <select
                name="placement"
                defaultValue={tooltip?.placement ?? "top"}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="top">Boven</option>
                <option value="right">Rechts</option>
                <option value="bottom">Onder</option>
                <option value="left">Links</option>
              </select>
            </label>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Doelgroepen</p>
            <div className="mt-3 grid gap-2">
              {options.audiences.map((audience) => (
                <label key={audience.key} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    name="audienceKeys"
                    type="checkbox"
                    value={audience.key}
                    defaultChecked={selectedAudiences.has(audience.key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{audience.label}</span>
                    <span className="block text-xs text-slate-500">{audience.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Gerelateerde artikelen</p>
            <select
              name="relatedArticleIds"
              multiple
              defaultValue={[...selectedRelated]}
              className="mt-3 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {options.relatedArticles.map((article) => (
                <option key={article.id} value={article.id}>
                  {article.title}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">Gebruik Ctrl/Cmd om meerdere artikelen te selecteren.</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="openInDrawer" type="checkbox" defaultChecked={tooltip?.openInDrawer ?? false} />
              Open uitgebreide hulp als drawer
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="showRelatedArticles" type="checkbox" value="on" defaultChecked={tooltip?.showRelatedArticles ?? true} />
              Toon gerelateerde artikelen
            </label>
          </div>
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="submit" className="gap-2">
          <Save className="h-4 w-4" />
          {tooltip ? "Bijwerken" : "Opslaan"}
        </Button>
      </div>
    </form>
  );
}

export default async function KnowledgebaseTooltipsPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const [tooltips, options, previewModel] = await Promise.all([
    listKnowledgebaseTooltipsForManagement(),
    listKnowledgebaseEditorOptions(),
    getPlatformContentPreviewModel("tooltips", resolvedSearchParams),
  ]);
  const published = tooltips.filter((tooltip) => tooltip.status === "published").length;

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
              <Link href="/platform/knowledgebase">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
            <p className="text-sm font-medium text-slate-500">Knowledgebase</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Tooltips</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Beheer korte helpteksten die bij functies, velden en knoppen getoond worden en doorklikken naar volledige handleidingen.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800">
              {published} gepubliceerd
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
              {tooltips.length} totaal
            </Badge>
          </div>
        </header>

        <PlatformContentPreviewPanel resource="tooltips" model={previewModel} />

        <TooltipForm tooltip={null} options={options} />

        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Bestaande tooltips</h2>
            <p className="mt-1 text-sm text-slate-500">Wijzig scope, content, artikelkoppeling en gerelateerde artikelen per tooltip.</p>
          </div>
          {tooltips.map((tooltip) => (
            <div key={tooltip.id} className="grid gap-2">
              <TooltipForm tooltip={tooltip} options={options} />
              {tooltip.status !== "archived" && (
                <form action={archiveTooltipAction} className="flex justify-end">
                  <input type="hidden" name="id" value={tooltip.id} />
                  <Button type="submit" variant="outline" className="gap-2 text-rose-700">
                    <Archive className="h-4 w-4" />
                    Archiveer tooltip
                  </Button>
                </form>
              )}
              <p className="text-right text-xs text-slate-500">Laatst bijgewerkt: {formatDate(tooltip.updatedAt)}</p>
            </div>
          ))}
          {tooltips.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Geen tooltips gevonden.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
