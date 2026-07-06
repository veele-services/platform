import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, Save } from "lucide-react";
import {
  addPlatformRoadmapComment,
  getPlatformRoadmapItem,
  listPlatformRoadmapEditorOptions,
  savePlatformRoadmapItemFromForm,
  type RoadmapEditorOptions,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoadmapStatus } from "@workspace/db";

export const metadata = {
  title: "Roadmap detail",
};

const STATUS_OPTIONS: Array<{ key: RoadmapStatus; label: string }> = [
  { key: "new", label: "Nieuw" },
  { key: "considering", label: "In overweging" },
  { key: "in_development", label: "In ontwikkeling" },
  { key: "done", label: "Afgerond" },
  { key: "archived", label: "Gearchiveerd" },
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

type Props = {
  params: Promise<{ itemId: string }>;
};

async function saveItemAction(formData: FormData): Promise<void> {
  "use server";
  await savePlatformRoadmapItemFromForm(formData);
}

async function commentAction(formData: FormData): Promise<void> {
  "use server";
  await addPlatformRoadmapComment(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RoadmapEditForm({ item, options }: { item: RoadmapItemSummary; options: RoadmapEditorOptions }) {
  const selectedAudiences = new Set(item.audienceKeys);
  const selectedModules = new Set(item.moduleKeys);
  const selectedReleases = new Set(item.linkedReleases.map((release) => release.id));

  return (
    <form action={saveItemAction} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="id" value={item.id} />
      <div className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Scope
              <select name="scope" defaultValue={item.scope} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                <option value="global">Global</option>
                <option value="tenant">Tenantwens</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titel
              <input name="title" required defaultValue={item.title} className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input name="slug" defaultValue={item.slug} className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tenant
              <select name="tenantId" defaultValue={item.tenantId ?? ""} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                <option value="">Geen tenant</option>
                {options.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">
            Omschrijving
            <textarea name="description" required defaultValue={item.description} className="min-h-32 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal leading-6" />
          </label>
        </section>
      </div>

      <aside className="grid gap-5 self-start">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Planning en publicatie</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select name="status" defaultValue={item.status} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.key} value={status.key}>{status.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Statusnotitie
              <input name="statusNote" placeholder="Optioneel bij statuswijziging" className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioriteit
              <select name="priority" defaultValue={item.priority} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                <option value="low">Laag</option>
                <option value="normal">Normaal</option>
                <option value="high">Hoog</option>
                <option value="critical">Kritiek</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Geplande versie
              <input name="plannedVersion" defaultValue={item.plannedVersion ?? ""} className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Verwachte oplevering
              <input name="expectedDelivery" type="date" defaultValue={item.expectedDelivery?.slice(0, 10) ?? ""} className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal" />
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input name="publicVisible" type="checkbox" defaultChecked={item.publicVisible} />
              Zichtbaar voor tenants
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input name="featured" type="checkbox" defaultChecked={item.featured} />
              Uitgelicht
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Scope</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Audiences</p>
              <div className="mt-2 grid gap-2">
                {AUDIENCES.map((audience) => (
                  <label key={audience.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input name="audienceKeys" type="checkbox" value={audience.key} defaultChecked={selectedAudiences.has(audience.key)} />
                    {audience.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Modules</p>
              <select name="moduleKeys" multiple defaultValue={[...selectedModules]} className="mt-2 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {options.modules.map((module) => (
                  <option key={module.key} value={module.key}>{module.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Release-koppelingen</p>
              <select name="releaseIds" multiple defaultValue={[...selectedReleases]} className="mt-2 min-h-32 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {options.releases.map((release) => (
                  <option key={release.id} value={release.id}>{release.version} - {release.title}</option>
                ))}
              </select>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Interne notitie
              <textarea name="internalNote" defaultValue={item.internalNote ?? ""} className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          </div>
        </section>

        <Button type="submit" className="gap-2">
          <Save className="h-4 w-4" />
          Wijzigingen opslaan
        </Button>
      </aside>
    </form>
  );
}

function RoadmapActivity({ item }: { item: RoadmapItemSummary }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Reacties en statusgeschiedenis</h2>
      <form action={commentAction} className="mt-4 grid gap-3">
        <input type="hidden" name="id" value={item.id} />
        <textarea name="body" placeholder="Voeg een interne of tenant-zichtbare reactie toe." className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex flex-wrap justify-end gap-2">
          <select name="visibility" defaultValue="platform_internal" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value="platform_internal">Intern</option>
            <option value="tenant_visible">Tenant zichtbaar</option>
          </select>
          <Button type="submit" variant="outline" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Reageer
          </Button>
        </div>
      </form>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-950">Reacties</p>
          <div className="mt-3 grid gap-3">
            {item.comments.map((comment) => (
              <div key={comment.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-xs text-slate-500">
                  <span>{comment.visibility === "platform_internal" ? "Intern" : "Tenant zichtbaar"}</span>
                  <span>{formatDate(comment.createdAt)}</span>
                </div>
                <p className="mt-2 leading-6 text-slate-700">{comment.body}</p>
              </div>
            ))}
            {item.comments.length === 0 && <p className="text-sm text-slate-500">Nog geen reacties.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-950">Statusgeschiedenis</p>
          <div className="mt-3 grid gap-3">
            {item.statusHistory.map((entry) => (
              <div key={entry.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-900">{entry.fromStatus ?? "start"} -&gt; {entry.toStatus}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
                {entry.note && <p className="mt-2 leading-6 text-slate-700">{entry.note}</p>}
              </div>
            ))}
            {item.statusHistory.length === 0 && <p className="text-sm text-slate-500">Nog geen statusregels.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function PlatformRoadmapDetailPage({ params }: Props) {
  const { itemId } = await params;
  const [item, options] = await Promise.all([
    getPlatformRoadmapItem(itemId),
    listPlatformRoadmapEditorOptions(),
  ]);

  if (!item) notFound();

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
              <Link href="/platform/roadmap">
                <ArrowLeft className="h-4 w-4" />
                Terug naar roadmap
              </Link>
            </Button>
            <p className="text-sm font-medium text-slate-500">Roadmap</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">{item.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{item.scope}</Badge>
              <Badge variant="outline">{item.status}</Badge>
              <Badge variant="outline">{item.priority}</Badge>
              <Badge variant="outline">{item.voteCount} stemmen</Badge>
            </div>
          </div>
        </header>

        <RoadmapEditForm item={item} options={options} />
        <RoadmapActivity item={item} />
      </div>
    </main>
  );
}
