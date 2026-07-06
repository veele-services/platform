"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  GitPullRequest,
  GripVertical,
  Loader2,
  MessageSquare,
  Pencil,
  Save,
  Sparkles,
  ThumbsUp,
  Users,
} from "lucide-react";
import {
  addPlatformRoadmapComment,
  archivePlatformRoadmapItem,
  changePlatformRoadmapPriority,
  changePlatformRoadmapStatus,
  convertRoadmapItemToGlobal,
  linkPlatformRoadmapReleases,
  savePlatformRoadmapItemFromForm,
  updatePlatformRoadmapAudiences,
  type RoadmapEditorOptions,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoadmapPriority, RoadmapStatus } from "@workspace/db";

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

function moduleLabel(moduleKey: string, options: RoadmapEditorOptions): string {
  return options.modules.find((module) => module.key === moduleKey)?.name ?? moduleKey;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateInputValue(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function toggleSetValue<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function StatusQuickButtons({ item }: { item: RoadmapItemSummary }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {STATUS_COLUMNS.map((status) => (
        <form key={status.key} action={changePlatformRoadmapStatus}>
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
  onDragStart,
}: {
  item: RoadmapItemSummary;
  options: RoadmapEditorOptions;
  selected: boolean;
  onDragStart: (item: RoadmapItemSummary, event: DragEvent<HTMLElement>) => void;
}) {
  const latestHistory = item.statusHistory[0] ?? null;
  const latestComment = item.comments[0] ?? null;
  const tenantNames = item.tenantName ?? item.tenantLinks.map((link) => link.tenantName).join(", ");
  const audienceLabel = item.audienceKeys.length === 0 ? "Alle audiences" : `${item.audienceKeys.length} audiences`;

  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(item, event)}
      className={`rounded-lg border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-cyan-400 ring-2 ring-cyan-100" : "border-slate-200"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/platform/roadmap?item=${item.id}`} className="line-clamp-2 font-semibold text-slate-950 hover:underline">
            {item.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-slate-400">
          {item.featured && <Sparkles className="h-4 w-4 text-amber-500" />}
          <GripVertical className="h-4 w-4" aria-label="Versleep roadmapitem" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClass(item.priority)}`}>
          {priorityLabel(item.priority)}
        </span>
        <Badge variant="outline" className={item.scope === "tenant" ? "border-cyan-200 bg-cyan-50 text-cyan-800" : ""}>
          {item.scope === "tenant" ? "Tenantwens" : "Global"}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />
          {audienceLabel}
        </Badge>
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
        Triage en bewerken
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function RoadmapScopeGroup({
  id,
  title,
  items,
  options,
  selectedItemId,
  collapsed,
  onToggle,
  onDragStart,
}: {
  id: string;
  title: string;
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
  selectedItemId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: (item: RoadmapItemSummary, event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <div className="grid gap-2">
      <button type="button" onClick={onToggle} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-white">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {title}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">{items.length}</span>
      </button>
      {!collapsed && (
        <div className="grid gap-2">
          {items.map((item) => (
            <RoadmapCard key={item.id} item={item} options={options} selected={selectedItemId === item.id} onDragStart={onDragStart} />
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
              Geen items in {id}.
            </div>
          )}
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
  collapsed,
  collapsedScopes,
  draggingItemId,
  pendingDropStatus,
  onToggleColumn,
  onToggleScope,
  onDragStart,
  onDropStatus,
}: {
  column: (typeof STATUS_COLUMNS)[number];
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
  selectedItemId: string | null;
  collapsed: boolean;
  collapsedScopes: Set<string>;
  draggingItemId: string | null;
  pendingDropStatus: RoadmapStatus | null;
  onToggleColumn: () => void;
  onToggleScope: (key: string) => void;
  onDragStart: (item: RoadmapItemSummary, event: DragEvent<HTMLElement>) => void;
  onDropStatus: (status: RoadmapStatus, event: DragEvent<HTMLDivElement>) => void;
}) {
  const columnItems = items.filter((item) => item.status === column.key);
  const tenantItems = columnItems.filter((item) => item.scope === "tenant");
  const globalItems = columnItems.filter((item) => item.scope === "global");
  const isDragTarget = Boolean(draggingItemId && pendingDropStatus !== column.key);

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropStatus(column.key, event)}
      className={`rounded-lg border p-3 transition ${isDragTarget ? "border-cyan-300 bg-cyan-50/60" : "border-slate-200 bg-slate-100/70"}`}
    >
      <button type="button" onClick={onToggleColumn} className="mb-3 flex w-full items-start justify-between gap-2 text-left">
        <span>
          <span className="flex items-center gap-1.5 font-semibold text-slate-950">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {column.label}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{column.description}</span>
        </span>
        <Badge variant="outline" className="bg-white">{pendingDropStatus === column.key ? <Loader2 className="h-3 w-3 animate-spin" /> : columnItems.length}</Badge>
      </button>
      {!collapsed && (
        <div className="grid gap-4">
          <RoadmapScopeGroup
            id={`${column.key}-tenant`}
            title="Tenant featurewensen"
            items={tenantItems}
            options={options}
            selectedItemId={selectedItemId}
            collapsed={collapsedScopes.has(`${column.key}:tenant`)}
            onToggle={() => onToggleScope(`${column.key}:tenant`)}
            onDragStart={onDragStart}
          />
          <RoadmapScopeGroup
            id={`${column.key}-global`}
            title="Global roadmap"
            items={globalItems}
            options={options}
            selectedItemId={selectedItemId}
            collapsed={collapsedScopes.has(`${column.key}:global`)}
            onToggle={() => onToggleScope(`${column.key}:global`)}
            onDragStart={onDragStart}
          />
        </div>
      )}
    </div>
  );
}

function AudienceEditor({ item }: { item: RoadmapItemSummary }) {
  const selected = new Set(item.audienceKeys);

  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <Users className="h-4 w-4 text-cyan-700" />
        Audiences beheren
      </h3>
      <form action={updatePlatformRoadmapAudiences} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={item.id} />
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <label key={audience.key} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input name="audienceKeys" type="checkbox" value={audience.key} defaultChecked={selected.has(audience.key)} />
              {audience.label}
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-slate-500">Geen selectie betekent zichtbaar voor alle audiences die verder door tenant, module en permissies mogen kijken.</p>
        <Button type="submit" variant="outline" size="sm" className="w-fit gap-1">
          <Check className="h-3.5 w-3.5" />
          Audiences opslaan
        </Button>
      </form>
    </section>
  );
}

function ItemEditForm({ item, options }: { item: RoadmapItemSummary; options: RoadmapEditorOptions }) {
  return (
    <details className="rounded-lg border border-slate-200 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Pencil className="h-4 w-4 text-cyan-700" />
          Roadmapitem bewerken
        </span>
        <Badge variant="outline">Inline</Badge>
      </summary>
      <form action={savePlatformRoadmapItemFromForm} className="mt-4 grid gap-3">
        <input type="hidden" name="id" value={item.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Scope
            <select name="scope" defaultValue={item.scope} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              <option value="global">Global</option>
              <option value="tenant">Tenantwens</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Tenant
            <select name="tenantId" defaultValue={item.tenantId ?? ""} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              <option value="">Geen tenant</option>
              {options.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Titel
          <input name="title" required defaultValue={item.title} className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal text-slate-900" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Omschrijving
          <textarea name="description" required defaultValue={item.description} className="min-h-24 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-900" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Status
            <select name="status" defaultValue={item.status} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              {STATUS_OPTIONS.map((status) => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Prioriteit
            <select name="priority" defaultValue={item.priority} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority.key} value={priority.key}>{priority.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Geplande versie
            <input name="plannedVersion" defaultValue={item.plannedVersion ?? ""} className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal text-slate-900" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Verwachte oplevering
            <input name="expectedDelivery" type="date" defaultValue={dateInputValue(item.expectedDelivery)} className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal text-slate-900" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Modules
            <select name="moduleKeys" multiple defaultValue={item.moduleKeys} className="min-h-28 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900">
              {options.modules.map((module) => (
                <option key={module.key} value={module.key}>{module.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Releases
            <select name="releaseIds" multiple defaultValue={item.linkedReleases.map((release) => release.id)} className="min-h-28 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900">
              {options.releases.map((release) => (
                <option key={release.id} value={release.id}>{release.version} - {release.title}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-2">
          {AUDIENCES.map((audience) => (
            <label key={audience.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input name="audienceKeys" type="checkbox" value={audience.key} defaultChecked={item.audienceKeys.includes(audience.key)} />
              {audience.label}
            </label>
          ))}
        </div>

        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Interne notitie
          <textarea name="internalNote" defaultValue={item.internalNote ?? ""} className="min-h-20 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-900" />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
            <input name="publicVisible" type="checkbox" defaultChecked={item.publicVisible} />
            Publiek voor tenants
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
            <input name="featured" type="checkbox" defaultChecked={item.featured} />
            Uitgelicht
          </label>
        </div>
        <Button type="submit" size="sm" className="w-fit gap-1">
          <Save className="h-3.5 w-3.5" />
          Wijzigingen opslaan
        </Button>
      </form>
    </details>
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
        <Pencil className="h-6 w-6 text-cyan-700" />
        <h2 className="mt-3 text-lg font-semibold text-slate-950">Triagepaneel</h2>
        <p className="mt-2 leading-6">Selecteer een kaart om status, prioriteit, audiences, inhoud, comments en historie direct op het bord te beheren.</p>
      </aside>
    );
  }

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
        <form action={changePlatformRoadmapStatus} className="mt-3 grid gap-2">
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

        <form action={changePlatformRoadmapPriority} className="mt-4 grid gap-2">
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

        <form action={linkPlatformRoadmapReleases} className="mt-4 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Koppelen aan release
            <select name="releaseIds" multiple defaultValue={item.linkedReleases.map((release) => release.id)} className="min-h-28 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900">
              {options.releases.map((release) => (
                <option key={release.id} value={release.id}>{release.version} - {release.title}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" size="sm">Releasekoppeling opslaan</Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.scope === "tenant" && (
            <form action={convertRoadmapItemToGlobal}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="outline" size="sm" className="gap-1">
                <GitPullRequest className="h-3.5 w-3.5" />
                Maak global
              </Button>
            </form>
          )}
          <form action={archivePlatformRoadmapItem}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" size="sm" className="gap-1 text-rose-700">
              <Archive className="h-3.5 w-3.5" />
              Archiveer
            </Button>
          </form>
        </div>
      </section>

      <AudienceEditor item={item} />
      <ItemEditForm item={item} options={options} />

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-950">Comment toevoegen</h3>
        <form action={addPlatformRoadmapComment} className="mt-3 grid gap-2">
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
        <h3 className="text-sm font-semibold text-slate-950">Statusgeschiedenis</h3>
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
    </aside>
  );
}

export function RoadmapBoardClient({
  items,
  options,
  selectedItemId,
}: {
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
  selectedItemId: string | null;
}) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<RoadmapStatus>>(new Set());
  const [collapsedScopes, setCollapsedScopes] = useState<Set<string>>(new Set());
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [pendingDropStatus, setPendingDropStatus] = useState<RoadmapStatus | null>(null);
  const [, startTransition] = useTransition();
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) ?? null, [items, selectedItemId]);

  function handleDragStart(item: RoadmapItemSummary, event: DragEvent<HTMLElement>) {
    setDraggingItemId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }

  function handleDropStatus(status: RoadmapStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain") || draggingItemId;
    const item = items.find((entry) => entry.id === itemId);
    setDraggingItemId(null);
    if (!item || item.status === status) return;

    const formData = new FormData();
    formData.set("id", item.id);
    formData.set("status", status);
    formData.set("note", `Versleept naar ${statusLabel(status)}.`);
    setPendingDropStatus(status);
    startTransition(() => {
      void changePlatformRoadmapStatus(formData).finally(() => setPendingDropStatus(null));
    });
  }

  return (
    <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-4 xl:grid-cols-4">
        {STATUS_COLUMNS.map((column) => (
          <RoadmapColumn
            key={column.key}
            column={column}
            items={items}
            options={options}
            selectedItemId={selectedItemId}
            collapsed={collapsedColumns.has(column.key)}
            collapsedScopes={collapsedScopes}
            draggingItemId={draggingItemId}
            pendingDropStatus={pendingDropStatus}
            onToggleColumn={() => setCollapsedColumns((current) => toggleSetValue(current, column.key))}
            onToggleScope={(key) => setCollapsedScopes((current) => toggleSetValue(current, key))}
            onDragStart={handleDragStart}
            onDropStatus={handleDropStatus}
          />
        ))}
      </div>
      <TriagePanel item={selectedItem} options={options} />
    </section>
  );
}
