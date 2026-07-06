import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitPullRequest,
  MessageSquare,
  Rocket,
  Save,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import {
  addPlatformRoadmapComment,
  archivePlatformRoadmapItem,
  changePlatformRoadmapPriority,
  changePlatformRoadmapStatus,
  convertRoadmapItemToGlobal,
  linkPlatformRoadmapReleases,
  listPlatformRoadmapBoard,
  savePlatformRoadmapItemFromForm,
  type RoadmapEditorOptions,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
import type { RoadmapPriority, RoadmapStatus } from "@workspace/db";

export const metadata = {
  title: "Roadmap",
};

type Props = {
  searchParams: Promise<{
    item?: string | string[];
  }>;
};

const STATUS_COLUMNS: Array<{ key: RoadmapStatus; label: string; description: string }> = [
  { key: "new", label: "Nieuw", description: "Nieuwe wensen en ruwe ideeen." },
  { key: "considering", label: "In overweging", description: "Wordt beoordeeld en gespecificeerd." },
  { key: "in_development", label: "In ontwikkeling", description: "Actief in ontwerp of bouw." },
  { key: "done", label: "Afgerond", description: "Opgeleverd of klaar voor release." },
];

const STATUS_OPTIONS: Array<{ key: RoadmapStatus; label: string }> = [
  ...STATUS_COLUMNS.map(({ key, label }) => ({ key, label })),
  { key: "archived", label: "Gearchiveerd" },
];

const PRIORITY_OPTIONS: Array<{ key: RoadmapPriority; label: string }> = [
  { key: "low", label: "Laag" },
  { key: "normal", label: "Normaal" },
  { key: "high", label: "Hoog" },
  { key: "critical", label: "Kritiek" },
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

async function changePriorityAction(formData: FormData): Promise<void> {
  "use server";
  await changePlatformRoadmapPriority(formData);
}

async function linkReleasesAction(formData: FormData): Promise<void> {
  "use server";
  await linkPlatformRoadmapReleases(formData);
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

function statusClass(status: RoadmapStatus): string {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "in_development") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "considering") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function statusLabel(status: RoadmapStatus): string {
  return STATUS_OPTIONS.find((option) => option.key === status)?.label ?? status;
}

function priorityLabel(priority: RoadmapPriority): string {
  return PRIORITY_OPTIONS.find((option) => option.key === priority)?.label ?? priority;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function moduleLabel(moduleKey: string, options: RoadmapEditorOptions): string {
  return options.modules.find((module) => module.key === moduleKey)?.name ?? moduleKey;
}

function normalizedSearchParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function RoadmapCreateForm({ options }: { options: RoadmapEditorOptions }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
        <span className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-cyan-700" />
          <span>
            <span className="block text-lg font-semibold text-slate-950">Nieuw roadmapitem</span>
            <span className="text-sm text-slate-500">Maak een global roadmapitem of registreer een tenantwens namens een tenant.</span>
          </span>
        </span>
        <Badge variant="outline">Toevoegen</Badge>
      </summary>
      <form action={saveItemAction} className="grid gap-4 border-t border-slate-200 p-5">
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
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority.key} value={priority.key}>{priority.label}</option>
              ))}
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
    </details>
  );
}

function StatusQuickButtons({ item }: { item: RoadmapItemSummary }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {STATUS_COLUMNS.map((status) => (
        <form key={status.key} action={changeStatusAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="status" value={status.key} />
          <input type="hidden" name="note" value={`Snelle triage naar ${status.label}.`} />
          <Button
            type="submit"
            variant={item.status === status.key ? "default" : "outline"}
            size="sm"
            disabled={item.status === status.key}
            className="h-8 w-full px-2 text-xs"
          >
            {status.label}
          </Button>
        </form>
      ))}
    </div>
  );
}

function RoadmapCard({
  item,
  options,
  selected,
}: {
  item: RoadmapItemSummary;
  options: RoadmapEditorOptions;
  selected: boolean;
}) {
  const latestHistory = item.statusHistory[0] ?? null;
  const latestComment = item.comments[0] ?? null;
  const tenantNames = item.tenantName ?? item.tenantLinks.map((link) => link.tenantName).join(", ");

  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${selected ? "border-cyan-400 ring-2 ring-cyan-100" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/platform/roadmap?item=${item.id}`} className="line-clamp-2 font-semibold text-slate-950 hover:underline">
            {item.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p>
        </div>
        {item.featured && <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClass(item.priority)}`}>
          {priorityLabel(item.priority)}
        </span>
        <Badge variant="outline" className={item.scope === "tenant" ? "border-cyan-200 bg-cyan-50 text-cyan-800" : ""}>
          {item.scope === "tenant" ? "Tenantwens" : "Global"}
        </Badge>
        {item.publicVisible && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Publiek</Badge>}
      </div>

      <dl className="mt-3 grid gap-1.5 text-[11px] text-slate-500">
        <div className="flex justify-between gap-3">
          <dt>Tenant</dt>
          <dd className="truncate text-right font-medium text-slate-700">{tenantNames || "-"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Modules</dt>
          <dd className="truncate text-right font-medium text-slate-700">{item.moduleKeys.map((key) => moduleLabel(key, options)).join(", ") || "Alle"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Release</dt>
          <dd className="truncate text-right font-medium text-slate-700">{item.linkedReleases.map((release) => release.version).join(", ") || "-"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Signalen</dt>
          <dd className="inline-flex items-center gap-2 font-medium text-slate-700">
            <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{item.voteCount}</span>
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{item.comments.length}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <StatusQuickButtons item={item} />
      </div>

      {(latestHistory || latestComment) && (
        <div className="mt-3 rounded-md bg-slate-50 p-2 text-[11px] leading-5 text-slate-600">
          {latestHistory && <p>Status: {statusLabel(latestHistory.toStatus)} op {formatDate(latestHistory.createdAt)}</p>}
          {latestComment && <p className="line-clamp-2">Reactie: {latestComment.body}</p>}
        </div>
      )}

      <Link href={`/platform/roadmap?item=${item.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline">
        Triagepaneel
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function RoadmapScopeGroup({
  title,
  items,
  options,
  selectedItemId,
}: {
  title: string;
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
  selectedItemId: string | null;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">{items.length}</span>
      </div>
      {items.map((item) => (
        <RoadmapCard key={item.id} item={item} options={options} selected={selectedItemId === item.id} />
      ))}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
          Geen items.
        </div>
      )}
    </div>
  );
}

function RoadmapColumn({
  column,
  items,
  options,
  selectedItemId,
}: {
  column: (typeof STATUS_COLUMNS)[number];
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
  selectedItemId: string | null;
}) {
  const columnItems = items.filter((item) => item.status === column.key);
  const tenantItems = columnItems.filter((item) => item.scope === "tenant");
  const globalItems = columnItems.filter((item) => item.scope === "global");

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-3">
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-950">{column.label}</h2>
          <Badge variant="outline" className="bg-white">{columnItems.length}</Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
      </div>
      <div className="grid gap-4">
        <RoadmapScopeGroup title="Tenant featurewensen" items={tenantItems} options={options} selectedItemId={selectedItemId} />
        <RoadmapScopeGroup title="Global roadmap" items={globalItems} options={options} selectedItemId={selectedItemId} />
      </div>
    </div>
  );
}

function TriagePanel({
  item,
  options,
}: {
  item: RoadmapItemSummary | null;
  options: RoadmapEditorOptions;
}) {
  if (!item) {
    return (
      <aside className="sticky top-20 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">
        <Rocket className="h-6 w-6 text-cyan-700" />
        <h2 className="mt-3 text-lg font-semibold text-slate-950">Triagepaneel</h2>
        <p className="mt-2 leading-6">Selecteer een kaart om status, prioriteit, releasekoppelingen, comments en historie direct op het bord te beheren.</p>
      </aside>
    );
  }

  const selectedReleases = new Set(item.linkedReleases.map((release) => release.id));

  return (
    <aside className="sticky top-20 grid max-h-[calc(100vh-6rem)] gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Triage</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{item.title}</h2>
          </div>
          <Link href={`/platform/roadmap/${item.id}`} className="shrink-0 text-xs font-semibold text-cyan-700 hover:underline">
            Detail
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
          <Badge variant="outline">{item.scope === "tenant" ? "Tenantwens" : "Global"}</Badge>
          {item.publicVisible && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Publiek</Badge>}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
      </div>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-950">Snelle acties</h3>
        <form action={changeStatusAction} className="mt-3 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Status wijzigen
            <select name="status" defaultValue={item.status} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              {STATUS_OPTIONS.map((status) => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
          </label>
          <input name="note" placeholder="Statusnotitie" className="h-9 rounded-md border border-slate-300 px-2 text-sm" />
          <Button type="submit" variant="outline" size="sm">Status opslaan</Button>
        </form>

        <form action={changePriorityAction} className="mt-4 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Prioriteit wijzigen
            <select name="priority" defaultValue={item.priority} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority.key} value={priority.key}>{priority.label}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" size="sm">Prioriteit opslaan</Button>
        </form>

        <form action={linkReleasesAction} className="mt-4 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Koppelen aan release
            <select name="releaseIds" multiple defaultValue={[...selectedReleases]} className="min-h-28 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900">
              {options.releases.map((release) => (
                <option key={release.id} value={release.id}>{release.version} - {release.title}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" size="sm">Releasekoppeling opslaan</Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.scope === "tenant" && (
            <form action={convertAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="outline" size="sm" className="gap-1">
                <GitPullRequest className="h-3.5 w-3.5" />
                Maak global
              </Button>
            </form>
          )}
          <form action={archiveAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" size="sm" className="gap-1 text-rose-700">
              <Archive className="h-3.5 w-3.5" />
              Archiveer
            </Button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-950">Comment toevoegen</h3>
        <form action={commentAction} className="mt-3 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <textarea name="body" placeholder="Reactie voor triage, tenant of support..." className="min-h-20 rounded-md border border-slate-300 px-2 py-2 text-sm" />
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
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Clock3 className="h-4 w-4 text-cyan-700" />
          Statusgeschiedenis
        </h3>
        <div className="mt-3 grid gap-2">
          {item.statusHistory.map((entry) => (
            <div key={entry.id} className="rounded-md bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-900">{entry.fromStatus ? statusLabel(entry.fromStatus) : "Start"} naar {statusLabel(entry.toStatus)}</p>
              <p className="mt-1 text-slate-500">{formatDateTime(entry.createdAt)}</p>
              {entry.note && <p className="mt-2 leading-5 text-slate-700">{entry.note}</p>}
            </div>
          ))}
          {item.statusHistory.length === 0 && <p className="text-sm text-slate-500">Nog geen statusgeschiedenis.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <MessageSquare className="h-4 w-4 text-cyan-700" />
          Reacties
        </h3>
        <div className="mt-3 grid gap-2">
          {item.comments.map((comment) => (
            <div key={comment.id} className="rounded-md bg-slate-50 p-3 text-xs">
              <div className="flex justify-between gap-3 text-slate-500">
                <span>{comment.visibility === "platform_internal" ? "Intern" : "Tenant zichtbaar"}</span>
                <span>{formatDateTime(comment.createdAt)}</span>
              </div>
              <p className="mt-2 leading-5 text-slate-700">{comment.body}</p>
            </div>
          ))}
          {item.comments.length === 0 && <p className="text-sm text-slate-500">Nog geen reacties.</p>}
        </div>
      </section>
    </aside>
  );
}

export default async function PlatformRoadmapPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const selectedItemId = normalizedSearchParam(resolvedSearchParams.item);
  const { items, options } = await listPlatformRoadmapBoard();
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const tenantRequests = items.filter((item) => item.scope === "tenant").length;
  const globalItems = items.filter((item) => item.scope === "global").length;
  const doneItems = items.filter((item) => item.status === "done").length;

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1800px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Platformbeheer</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Roadmapbord</h1>
              <ResolvedFeatureHelp surface="platform" featureKey="platform.roadmap" moduleKey="roadmap" />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Triageer tenant featurewensen, beheer globale roadmapitems en koppel afgeronde items aan releases zonder detailpagina's te openen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="px-3 py-1">{globalItems} global</Badge>
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800">{tenantRequests} tenantwensen</Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{doneItems} afgerond</Badge>
          </div>
        </header>

        <RoadmapCreateForm options={options} />

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4 xl:grid-cols-4">
            {STATUS_COLUMNS.map((column) => (
              <RoadmapColumn
                key={column.key}
                column={column}
                items={items}
                options={options}
                selectedItemId={selectedItemId}
              />
            ))}
          </div>
          <TriagePanel item={selectedItem} options={options} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Tenant/global scheiding
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Tenant featurewensen blijven per kolom apart van global roadmapitems. Tenant admins zien alleen eigen tenantwensen,
            global items die publiek zichtbaar zijn of items die expliciet aan hun tenant gekoppeld zijn.
          </p>
        </section>
      </div>
    </main>
  );
}
