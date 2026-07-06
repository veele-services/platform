"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Save } from "lucide-react";
import {
  saveKnowledgebaseArticle,
  uploadKnowledgebaseMedia,
  type KnowledgebaseEditorOptions,
  type SaveKnowledgebaseArticleInput,
} from "@/app/actions/knowledgebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TipTapKnowledgebaseEditor } from "@/components/knowledgebase/TipTapKnowledgebaseEditor";
import type { FieldgridContentAudience, FieldgridContentStatus, KnowledgebaseArticleSummary } from "@workspace/db";

type KnowledgebaseArticleFormProps = {
  article: KnowledgebaseArticleSummary | null;
  options: KnowledgebaseEditorOptions;
};

function csv(values: string[]): string {
  return values.join(", ");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

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

function statusLabel(status: FieldgridContentStatus): string {
  if (status === "published") return "Gepubliceerd";
  if (status === "archived") return "Gearchiveerd";
  return "Concept";
}

export function KnowledgebaseArticleForm({ article, options }: KnowledgebaseArticleFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUploadTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [savedArticleId, setSavedArticleId] = useState(article?.id ?? "");

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [categoryId, setCategoryId] = useState(article?.category?.id ?? "");
  const [status, setStatus] = useState<FieldgridContentStatus>(article?.status ?? "draft");
  const [featured, setFeatured] = useState(article?.featured ?? false);
  const [keywords, setKeywords] = useState(csv(article?.keywords ?? []));
  const [smartTerms, setSmartTerms] = useState(csv(article?.smartTerms ?? []));
  const [contentHtml, setContentHtml] = useState(article?.contentHtml ?? "");
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [audienceKeys, setAudienceKeys] = useState<FieldgridContentAudience[]>(
    article?.audienceKeys.length ? article.audienceKeys : ["tenant_admin"],
  );
  const [moduleKeys, setModuleKeys] = useState<string[]>(article?.moduleKeys ?? []);
  const [requiredModuleKeys, setRequiredModuleKeys] = useState<string[]>(article?.requiredModuleKeys ?? []);
  const [permissionKeys, setPermissionKeys] = useState<string[]>(article?.permissionKeys ?? []);
  const [relatedArticleIds, setRelatedArticleIds] = useState<string[]>(article?.relatedArticles.map((related) => related.id) ?? []);

  const selectedModuleSummary = useMemo(() => {
    if (moduleKeys.length === 0) return "Alle actieve modules";
    return options.modules
      .filter((module) => moduleKeys.includes(module.key))
      .map((module) => module.name)
      .join(", ");
  }, [moduleKeys, options.modules]);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!article && (!slug || slug === slugify(title))) {
      setSlug(slugify(value));
    }
  }

  function submit() {
    setMessage(null);

    const payload: SaveKnowledgebaseArticleInput = {
      id: savedArticleId || article?.id || null,
      title,
      slug,
      summary,
      categoryId: categoryId || null,
      contentHtml,
      contentJson,
      keywords: splitCsv(keywords),
      smartTerms: splitCsv(smartTerms),
      status,
      featured,
      language: "nl",
      audienceKeys,
      moduleKeys,
      requiredModuleKeys,
      permissionKeys,
      relatedArticleIds,
    };

    startTransition(async () => {
      const result = await saveKnowledgebaseArticle(payload);
      if (!result.success) {
        setMessage(result.message);
        return;
      }

      setSavedArticleId(result.data.id);
      setMessage("Artikel opgeslagen.");
      if (!article) {
        router.replace(`/platform/knowledgebase/articles/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!savedArticleId) {
      setMessage("Sla het artikel eerst op voordat u media toevoegt.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("articleId", savedArticleId);

    startUploadTransition(async () => {
      const result = await uploadKnowledgebaseMedia(formData);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      form.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Media toegevoegd.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input id="title" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Bijvoorbeeld: Een nieuwe werkbon aanmaken" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="nieuwe-werkbon-aanmaken" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="summary">Korte samenvatting</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              placeholder="Leg in een zin uit waarvoor dit artikel bedoeld is."
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Artikelinhoud</h2>
              <p className="mt-1 text-sm text-slate-500">Gebruik duidelijke stappen, korte alinea's en callouts voor tips of waarschuwingen.</p>
            </div>
            <Badge variant="secondary">TipTap</Badge>
          </div>
          <TipTapKnowledgebaseEditor
            initialHtml={article?.contentHtml}
            onChange={(html, json) => {
              setContentHtml(html);
              setContentJson(json);
            }}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Zoekbaarheid en relaties</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="keywords">Zoekwoorden</Label>
              <Input id="keywords" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="werkbon, opdracht, planning" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smartTerms">Slimme zoektermen</Label>
              <Input id="smartTerms" value={smartTerms} onChange={(event) => setSmartTerms(event.target.value)} placeholder="klus maken, dienst plannen" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Gerelateerde artikelen</Label>
            <div className="grid max-h-60 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 md:grid-cols-2">
              {options.relatedArticles.length === 0 ? (
                <p className="text-sm text-slate-500">Nog geen andere artikelen beschikbaar.</p>
              ) : options.relatedArticles.map((related) => (
                <label key={related.id} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-slate-50">
                  <Checkbox
                    checked={relatedArticleIds.includes(related.id)}
                    onCheckedChange={(checked) => setRelatedArticleIds((values) => toggleValue(values, related.id, checked === true))}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{related.title}</span>
                    <span className="block truncate text-xs text-slate-500">/{related.slug}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="grid content-start gap-5">
        <section className="sticky top-20 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Publicatie</h2>
              <p className="mt-1 text-xs text-slate-500">{statusLabel(status)}</p>
            </div>
            <Button type="button" onClick={submit} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Opslaan
            </Button>
          </div>

          {message && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {message}
            </div>
          )}

          <div className="mt-4 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as FieldgridContentStatus)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="draft">Concept</option>
                <option value="published">Gepubliceerd</option>
                <option value="archived">Gearchiveerd</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categorie</Label>
              <select
                id="category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Geen categorie</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
              <Checkbox checked={featured} onCheckedChange={(checked) => setFeatured(checked === true)} />
              <span className="font-medium text-slate-900">Uitgelicht artikel</span>
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Doelgroepen</h2>
          <div className="mt-3 grid gap-2">
            {options.audiences.map((audience) => (
              <label key={audience.key} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-slate-50">
                <Checkbox
                  checked={audienceKeys.includes(audience.key)}
                  onCheckedChange={(checked) => setAudienceKeys((values) => toggleValue(values, audience.key, checked === true) as FieldgridContentAudience[])}
                />
                <span>
                  <span className="block font-medium text-slate-900">{audience.label}</span>
                  <span className="text-xs text-slate-500">{audience.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Module-scope</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedModuleSummary}</p>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {options.modules.map((module) => (
              <div key={module.key} className="rounded-md border border-slate-200 p-2">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={moduleKeys.includes(module.key)}
                    onCheckedChange={(checked) => {
                      setModuleKeys((values) => toggleValue(values, module.key, checked === true));
                      if (checked !== true) setRequiredModuleKeys((values) => values.filter((key) => key !== module.key));
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{module.name}</span>
                    <span className="block truncate text-xs text-slate-500">{module.key}</span>
                  </span>
                </label>
                {moduleKeys.includes(module.key) && (
                  <label className="mt-2 flex items-center gap-2 pl-6 text-xs text-slate-600">
                    <Checkbox
                      checked={requiredModuleKeys.includes(module.key)}
                      onCheckedChange={(checked) => setRequiredModuleKeys((values) => toggleValue(values, module.key, checked === true))}
                    />
                    Vereist actief bij tenant
                  </label>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Permissions</h2>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {options.permissions.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-slate-50">
                <Checkbox
                  checked={permissionKeys.includes(permission.key)}
                  onCheckedChange={(checked) => setPermissionKeys((values) => toggleValue(values, permission.key, checked === true))}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{permission.key}</span>
                  {permission.description && <span className="block text-xs text-slate-500">{permission.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Media</h2>
          <form onSubmit={uploadMedia} className="mt-3 grid gap-3">
            <Input ref={fileInputRef} name="file" type="file" accept="image/*,video/mp4,video/webm,application/pdf" />
            <Input name="altText" placeholder="Alt-tekst" />
            <Input name="caption" placeholder="Caption" />
            <Button type="submit" variant="outline" disabled={isUploading || !savedArticleId} className="gap-2">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Media toevoegen
            </Button>
          </form>

          <div className="mt-4 grid gap-2">
            {(article?.media ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Nog geen media gekoppeld.</p>
            ) : article?.media.map((item) => (
              <a
                key={item.id}
                href={`/platform/knowledgebase/media/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="min-w-0 flex-1 truncate">{item.caption || item.altText || item.storagePath}</span>
                <Badge variant="outline">{item.mediaType}</Badge>
              </a>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
