import Link from "next/link";
import { Archive, GitPullRequest, MessageSquare, Rocket, Save, Sparkles, ThumbsUp } from "lucide-react";
import {
  addPlatformRoadmapComment,
  archivePlatformRoadmapItem,
  changePlatformRoadmapStatus,
  convertRoadmapItemToGlobal,
  listPlatformRoadmapBoard,
  savePlatformRoadmapItemFromForm,
  type RoadmapEditorOptions,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoadmapStatus } from "@workspace/db";

export const metadata = {
  title: "Roadmap",
};

const STATUS_COLUMNS: Array<{ key: RoadmapStatus; label: string; description: string }> = [
  { key: "new", label: "Nieuw", description: "Nieuwe wensen en ruwe ideeen." },
  { key: "considering", label: "In overweging", description: "Wordt beoordeeld en gespecificeerd." },
  { key: "in_development", label: "In ontwikkeling", description: "Actief in ontwerp of bouw." },
  { key: "done", label: "Afgerond", description: "Opgeleverd of klaar voor release." },
];

const AUDIENCES = [
  { key: "tenant_admin", label: "Tenant admin" },
  { key: "tenant_management", label: "Management" },
  { key: "tenant_planning", label: "Planning" },
  { key: "tenant_administration", label: "Administratie" },
  { key: "tenant_personnel", label: "Personeel" },
  { key: "tenant_customer", label: "Klanten" },
  { key: "platform_admin", label: "Platform admin" },
] as const;

async function saveItemAction(formData: FormData): Promise<void> {
  "use server";
  await savePlatformRoadmapItemFromForm(formData);
}

async function changeStatusAction(formData: FormData): Promise<void> {
  "use server";
  await changePlatformRoadmapStatus(formData);
}

async function commentAction(formData: FormData): Promise<void> {
  "use server";
  await addPlatformRoadmapComment(formData);
}

async function archiveAction(formData: FormData): Promise<void> {
  "use server";
  await archivePlatformRoadmapItem(formData);
}

async function convertAction(formData: FormData): Promise<void> {
  "use server";
  await convertRoadmapItemToGlobal(formData);
}

function priorityClass(priority: string): string {
  if (priority === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function moduleLabel(moduleKey: string, options: RoadmapEditorOptions): string {
  return options.modules.find((module) => module.key === moduleKey)?.name ?? moduleKey;
}

function RoadmapCreateForm({ options }: { options: RoadmapEditorOptions }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-cyan-700" />
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Nieuw roadmapitem</h2>
          <p className="text-sm text-slate-500">Maak een global roadmapitem of registreer een tenantwens namens een tenant.</p>
        </div>
      </div>
      <form action={saveItemAction} className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_260px]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Scope
            <select name="scope" defaultValue="global" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
              <option value="global">Global</option>
              <option value="tenant">Tenantwens</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Titel
            <input name="title" required placeholder="Bijvoorbeeld: Planning met conflictstrip" className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tenant
            <select name="tenantId" defaultValue="" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
              <option value="">Geen tenant</option>
              {options.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </label>
        </div>

        <textarea name="description" required placeholder="Omschrijf de wens, aanleiding en gewenste uitkomst." className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />

        <div className="grid gap-3 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Status
            <select name="status" defaultValue="new" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
              {STATUS_COLUMNS.map((status) => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Prioriteit
            <select name="priority" defaultValue="normal" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
              <option value="low">Laag</option>
              <option value="normal">Normaal</option>
              <option value="high">Hoog</option>
              <option value="critical">Kritiek</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Geplande versie
            <input name="plannedVersion" placeholder="v1.8" className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Verwachte oplevering
            <input name="expectedDelivery" type="date" className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Audiences</p>
            <div className="mt-2 grid gap-2">
              {AUDIENCES.map((audience) => (
                <label key={audience.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input name="audienceKeys" type="checkbox" value={audience.key} />
                  {audience.label}
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Modules</p>
            <select name="moduleKeys" multiple className="mt-2 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {options.modules.map((module) => (
                <option key={module.key} value={module.key}>{module.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Release-koppeling</p>
            <select name="releaseIds" multiple className="mt-2 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {options.releases.map((release) => (
                <option key={release.id} value={release.id}>{release.version} - {release.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <textarea name="internalNote" placeholder="Interne notitie voor platformbeheer." className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
            <input name="publicVisible" type="checkbox" defaultChecked />
            Publiek voor tenants
          </label>
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
            <input name="featured" type="checkbox" />
            Uitgelicht
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" className="gap-2">
            <Save className="h-4 w-4" />
            Opslaan
          </Button>
        </div>
      </form>
    </section>
  );
}

function RoadmapCard({ item, options }: { item: RoadmapItemSummary; options: RoadmapEditorOptions }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/platform/roadmap/${item.id}`} className="font-semibold text-slate-950 hover:underline">
            {item.title}
          </Link>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.description}</p>
        </div>
        {item.featured && <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
        <Badge variant="outline">{item.scope === "global" ? "Global" : "Tenant"}</Badge>
        {item.publicVisible && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Tenant zichtbaar</Badge>}
      </div>

      <dl className="mt-3 grid gap-2 text-xs text-slate-600">
        <div className="flex justify-between gap-3">
          <dt>Tenant</dt>
          <dd className="text-right font-medium text-slate-800">{item.tenantName ?? (item.tenantLinks.map((link) => link.tenantName).join(", ") || "-")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Modules</dt>
          <dd className="text-right font-medium text-slate-800">{item.moduleKeys.map((key) => moduleLabel(key, options)).join(", ") || "Alle modules"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Release</dt>
          <dd className="text-right font-medium text-slate-800">{item.linkedReleases.map((release) => release.version).join(", ") || "-"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Stemmen</dt>
          <dd className="inline-flex items-center gap-1 font-medium text-slate-800"><ThumbsUp className="h-3.5 w-3.5" />{item.voteCount}</dd>
        </div>
      </dl>

      <form action={changeStatusAction} className="mt-4 grid gap-2">
        <input type="hidden" name="id" value={item.id} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select name="status" defaultValue={item.status} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {STATUS_COLUMNS.map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">Status</Button>
        </div>
        <input name="note" placeholder="Optionele statusnotitie" className="h-9 rounded-md border border-slate-300 px-2 text-xs" />
      </form>

      <form action={commentAction} className="mt-3 grid gap-2">
        <input type="hidden" name="id" value={item.id} />
        <textarea name="body" placeholder="Interne of tenant-zichtbare reactie..." className="min-h-16 rounded-md border border-slate-300 px-2 py-2 text-xs" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select name="visibility" defaultValue="platform_internal" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">
            <option value="platform_internal">Intern</option>
            <option value="tenant_visible">Tenant zichtbaar</option>
          </select>
          <Button type="submit" variant="outline" size="sm" className="gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            Reageer
          </Button>
        </div>
      </form>

      <div className="mt-3 grid gap-1 text-xs text-slate-500">
        <p>Bijgewerkt: {formatDate(item.updatedAt)}</p>
        {item.comments[0] && <p className="line-clamp-2">Laatste reactie: {item.comments[0].body}</p>}
      </div>

      <div className="mt-3 flex flex-wrap justify-between gap-2">
        {item.scope === "tenant" ? (
          <form action={convertAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" size="sm" className="gap-1">
              <GitPullRequest className="h-3.5 w-3.5" />
              Maak global
            </Button>
          </form>
        ) : <span />}
        <form action={archiveAction}>
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="outline" size="sm" className="gap-1 text-rose-700">
            <Archive className="h-3.5 w-3.5" />
            Archiveer
          </Button>
        </form>
      </div>
    </article>
  );
}

export default async function PlatformRoadmapPage() {
  const { items, options } = await listPlatformRoadmapBoard();
  const tenantRequests = items.filter((item) => item.scope === "tenant").length;
  const globalItems = items.filter((item) => item.scope === "global").length;

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Platformbeheer</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Roadmapbord</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Triageer tenant featurewensen, beheer globale roadmapitems en koppel afgeronde items aan releases.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="px-3 py-1">{globalItems} global</Badge>
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800">{tenantRequests} tenantwensen</Badge>
          </div>
        </header>

        <RoadmapCreateForm options={options} />

        <section className="grid gap-4 xl:grid-cols-4">
          {STATUS_COLUMNS.map((column) => {
            const columnItems = items.filter((item) => item.status === column.key);
            return (
              <div key={column.key} className="rounded-lg border border-slate-200 bg-slate-100/70 p-3">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-950">{column.label}</h2>
                    <Badge variant="outline" className="bg-white">{columnItems.length}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                </div>
                <div className="grid gap-3">
                  {columnItems.map((item) => (
                    <RoadmapCard key={item.id} item={item} options={options} />
                  ))}
                  {columnItems.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                      Geen items.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
