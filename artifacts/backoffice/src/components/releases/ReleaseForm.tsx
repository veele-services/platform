"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  saveRelease,
  type ReleaseEditorOptions,
  type ReleaseItemInput,
  type SaveReleaseInput,
} from "@/app/actions/releases";
import { TipTapKnowledgebaseEditor } from "@/components/knowledgebase/TipTapKnowledgebaseEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldgridContentAudience, ReleaseImpactLevel, ReleaseStatus, ReleaseSummary } from "@workspace/db";

type ReleaseFormProps = {
  release: ReleaseSummary | null;
  options: ReleaseEditorOptions;
};

const AUDIENCES: Array<{ key: FieldgridContentAudience; label: string }> = [
  { key: "platform_admin", label: "Platform admin" },
  { key: "support", label: "Support" },
  { key: "tenant_admin", label: "Tenant admin" },
  { key: "tenant_management", label: "Management" },
  { key: "tenant_planning", label: "Planning" },
  { key: "tenant_administration", label: "Administratie" },
  { key: "tenant_personnel", label: "Personeel" },
  { key: "tenant_customer", label: "Klanten" },
];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function toggleValue(values: string[], value: string, checked: boolean): string[] {
  const set = new Set(values);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set];
}

function emptyItem(): ReleaseItemInput {
  return {
    title: "",
    description: "",
    categoryId: null,
    moduleKey: null,
    impactLevel: "medium",
    sortOrder: 0,
  };
}

export function ReleaseForm({ release, options }: ReleaseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(release?.version ?? "");
  const [title, setTitle] = useState(release?.title ?? "");
  const [slug, setSlug] = useState(release?.slug ?? "");
  const [summary, setSummary] = useState(release?.summary ?? "");
  const [contentHtml, setContentHtml] = useState(release?.contentHtml ?? "");
  const [status, setStatus] = useState<ReleaseStatus>(release?.status ?? "draft");
  const [impactLevel, setImpactLevel] = useState<ReleaseImpactLevel>(release?.impactLevel ?? "medium");
  const [featured, setFeatured] = useState(release?.featured ?? false);
  const [audienceKeys, setAudienceKeys] = useState<FieldgridContentAudience[]>(
    release?.audienceKeys.length ? release.audienceKeys : ["tenant_admin"],
  );
  const [moduleKeys, setModuleKeys] = useState<string[]>(release?.moduleKeys ?? []);
  const [roadmapItemIds, setRoadmapItemIds] = useState<string[]>(release?.roadmapItems.map((item) => item.id) ?? []);
  const [items, setItems] = useState<ReleaseItemInput[]>(
    release?.items.length
      ? release.items.map((item, index) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        categoryId: item.category?.id ?? null,
        moduleKey: item.moduleKey,
        impactLevel: item.impactLevel,
        sortOrder: item.sortOrder || index + 1,
      }))
      : [emptyItem()],
  );

  function onTitleChange(value: string) {
    setTitle(value);
    if (!release && !slug) setSlug(slugify(`${version} ${value}`));
  }

  function updateItem(index: number, patch: Partial<ReleaseItemInput>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function submit() {
    setMessage(null);
    const payload: SaveReleaseInput = {
      id: release?.id ?? null,
      version,
      title,
      slug,
      summary,
      contentHtml,
      contentText: null,
      status,
      impactLevel,
      featured,
      audienceKeys,
      moduleKeys,
      roadmapItemIds,
      items: items.map((item, index) => ({ ...item, sortOrder: index + 1 })),
    };

    startTransition(async () => {
      try {
        const result = await saveRelease(payload);
        setMessage("Release opgeslagen.");
        if (!release) router.replace(`/platform/releases/${result.slug}`);
        else router.refresh();
      } catch (error) {
        setMessage((error as Error).message || "Opslaan mislukt.");
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_260px]">
            <div className="space-y-2">
              <Label htmlFor="version">Versie</Label>
              <Input id="version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v1.8.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input id="title" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Planning en release highlights" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="v1-8-planning" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="summary">Samenvatting</Label>
            <textarea
              id="summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Korte samenvatting voor releaseoverzichten en dashboardcontainers."
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Release notes</h2>
          <div className="mt-4">
            <TipTapKnowledgebaseEditor
              initialHtml={contentHtml}
              placeholder="Schrijf de release note met duidelijke impact, modules, verbeteringen en eventuele actie voor gebruikers..."
              onChange={(html) => setContentHtml(html)}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Release items</h2>
              <p className="mt-1 text-sm text-slate-500">Splits de release in concrete wijzigingen per module of categorie.</p>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setItems((current) => [...current, emptyItem()])}>
              <Plus className="h-4 w-4" />
              Item
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {items.map((item, index) => (
              <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_130px_auto]">
                  <Input value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} placeholder="Titel item" />
                  <select value={item.categoryId ?? ""} onChange={(event) => updateItem(index, { categoryId: event.target.value || null })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Geen categorie</option>
                    {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <select value={item.moduleKey ?? ""} onChange={(event) => updateItem(index, { moduleKey: event.target.value || null })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Geen module</option>
                    {options.modules.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
                  </select>
                  <select value={item.impactLevel} onChange={(event) => updateItem(index, { impactLevel: event.target.value as ReleaseImpactLevel })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Item verwijderen">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <textarea
                  value={item.description}
                  onChange={(event) => updateItem(index, { description: event.target.value })}
                  placeholder="Omschrijving van deze wijziging."
                  className="mt-3 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="grid gap-5 self-start">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Publicatie</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value as ReleaseStatus)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                <option value="draft">Concept</option>
                <option value="published">Gepubliceerd</option>
                <option value="archived">Gearchiveerd</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Impact
              <select value={impactLevel} onChange={(event) => setImpactLevel(event.target.value as ReleaseImpactLevel)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <Checkbox checked={featured} onCheckedChange={(checked) => setFeatured(Boolean(checked))} />
              Uitgelicht in overzichten
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Audience en modules</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Audiences</p>
              <div className="mt-2 grid gap-2">
                {AUDIENCES.map((audience) => (
                  <label key={audience.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={audienceKeys.includes(audience.key)}
                      onCheckedChange={(checked) => setAudienceKeys((current) => toggleValue(current, audience.key, Boolean(checked)) as FieldgridContentAudience[])}
                    />
                    {audience.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Modules</p>
              <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3">
                {options.modules.map((module) => (
                  <label key={module.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox checked={moduleKeys.includes(module.key)} onCheckedChange={(checked) => setModuleKeys((current) => toggleValue(current, module.key, Boolean(checked)))} />
                    {module.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Roadmaplinks</h2>
          <select
            multiple
            value={roadmapItemIds}
            onChange={(event) => setRoadmapItemIds([...event.currentTarget.selectedOptions].map((option) => option.value))}
            className="mt-3 min-h-40 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {options.roadmapItems.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">Gebruik Ctrl/Cmd om meerdere roadmapitems te selecteren.</p>
        </section>

        {message && <Badge variant="outline" className="justify-center py-2">{message}</Badge>}
        <Button type="button" onClick={submit} disabled={isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {isPending ? "Opslaan..." : "Release opslaan"}
        </Button>
      </aside>
    </div>
  );
}
