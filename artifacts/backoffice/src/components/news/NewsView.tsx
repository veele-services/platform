"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  ImagePlus,
  Loader2,
  MailCheck,
  Newspaper,
  Plus,
  Save,
  Search,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import {
  archiveNewsPost,
  getNewsPost,
  listNewsPosts,
  saveNewsPost,
  uploadNewsHeroImage,
  type NewsAudienceOption,
  type NewsAudienceOptions,
  type NewsAudienceSelection,
  type NewsPostDetail,
  type NewsPostListRow,
} from "@/app/actions/news";
import type { NewsPostStatus } from "@workspace/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TenantConfirmDialog } from "@/components/tenant-ui";
import { cn } from "@/lib/utils";
import { TipTapNewsEditor } from "./TipTapNewsEditor";

type EditorJson = Record<string, unknown>;

type NewsFormState = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  contentJson: EditorJson | null;
  heroImageUrl: string;
  heroImagePath: string;
  status: NewsPostStatus;
  publishAt: string;
  audience: NewsAudienceSelection;
};

const EMPTY_AUDIENCE: NewsAudienceSelection = {
  allPersonnel: true,
  allCustomers: false,
  sectorIds: [],
  personnelIds: [],
  customerIds: [],
  customerTypeIds: [],
};

function emptyForm(): NewsFormState {
  return {
    id: null,
    title: "",
    slug: "",
    excerpt: "",
    contentHtml: "<p></p>",
    contentJson: null,
    heroImageUrl: "",
    heroImagePath: "",
    status: "draft",
    publishAt: "",
    audience: { ...EMPTY_AUDIENCE },
  };
}

const STATUS_LABELS: Record<NewsPostStatus, string> = {
  draft: "Concept",
  scheduled: "Gepland",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
};

const STATUS_STYLES: Record<NewsPostStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-slate-50 text-slate-500 border-slate-200",
};

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);

  return slug || "";
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDetail(post: NewsPostDetail): NewsFormState {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    contentHtml: post.contentHtml,
    contentJson: post.contentJson,
    heroImageUrl: post.heroImageUrl ?? "",
    heroImagePath: post.heroImagePath ?? "",
    status: post.status,
    publishAt: toDateTimeLocal(post.publishAt ?? post.publishedAt),
    audience: post.audience,
  };
}

function countAudience(audience: NewsAudienceSelection): number {
  let total = 0;
  if (audience.allPersonnel) total += 1;
  if (audience.allCustomers) total += 1;
  total += audience.sectorIds.length;
  total += audience.personnelIds.length;
  total += audience.customerIds.length;
  total += audience.customerTypeIds.length;
  return total;
}

function setIds(current: string[], id: string, checked: boolean): string[] {
  if (checked) return Array.from(new Set([...current, id]));
  return current.filter((value) => value !== id);
}

function TargetPicker({
  title,
  options,
  value,
  disabled,
  onChange,
}: {
  title: string;
  options: NewsAudienceOption[];
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.subtitle ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-[#081D3A]">{title}</p>
          <p className="text-xs text-[#64748B]">{value.length} geselecteerd</p>
        </div>
        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 pl-7 text-xs"
            placeholder="Filter"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-[#94A3B8]">
            Geen resultaten
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#F8FAFC]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <CheckboxAdapter
                  type="checkbox"
                  disabled={disabled}
                  checked={value.includes(option.id)}
                  onChange={(event) =>
                    onChange(setIds(value, option.id, event.target.checked))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] accent-[#00B7B3]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[#0F172A]">
                    {option.label}
                  </span>
                  {option.subtitle && (
                    <span className="block truncate text-xs text-[#64748B]">
                      {option.subtitle}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NewsViewProps {
  initialPosts: NewsPostListRow[];
  audienceOptions: NewsAudienceOptions;
  canWrite: boolean;
  canSend: boolean;
  canDelete: boolean;
}

export function NewsView({
  initialPosts,
  audienceOptions,
  canWrite,
  canSend,
  canDelete,
}: NewsViewProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [form, setForm] = useState<NewsFormState>(() => emptyForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadingHero, setUploadingHero] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((post) =>
      `${post.title} ${post.excerpt ?? ""} ${post.audienceSummary}`
        .toLowerCase()
        .includes(needle),
    );
  }, [posts, query]);

  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const editorKey = selectedId ?? "new";
  const canEdit = canWrite && form.status !== "archived";

  function flash(type: "success" | "error", text: string) {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  }

  function updateForm(patch: Partial<NewsFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateAudience(patch: Partial<NewsAudienceSelection>) {
    setForm((current) => ({
      ...current,
      audience: { ...current.audience, ...patch },
    }));
  }

  function startNewPost() {
    setSelectedId(null);
    setForm(emptyForm());
    setMessage(null);
  }

  function selectPost(id: string) {
    setSelectedId(id);
    startTransition(async () => {
      const detail = await getNewsPost(id);
      if (!detail) {
        flash("error", "Nieuwsbericht niet gevonden.");
        return;
      }
      setForm(fromDetail(detail));
    });
  }

  function refreshList(openId?: string) {
    startTransition(async () => {
      const nextPosts = await listNewsPosts();
      setPosts(nextPosts);
      if (openId) {
        const detail = await getNewsPost(openId);
        if (detail) {
          setSelectedId(openId);
          setForm(fromDetail(detail));
        }
      }
    });
  }

  function handleTitleChange(title: string) {
    setForm((current) => ({
      ...current,
      title,
      slug: current.id ? current.slug : slugify(title),
    }));
  }

  function submit(statusOverride?: NewsPostStatus) {
    if (!canWrite) return;
    const status = statusOverride ?? form.status;

    startTransition(async () => {
      const result = await saveNewsPost({
        id: form.id,
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        contentHtml: form.contentHtml,
        contentJson: form.contentJson,
        heroImageUrl: form.heroImageUrl || null,
        heroImagePath: form.heroImagePath || null,
        status,
        publishAt: form.publishAt || null,
        audience: form.audience,
      });

      if (!result.success) {
        flash("error", result.message ?? "Opslaan mislukt.");
        return;
      }
      if (!result.data) {
        flash("error", "Opslaan mislukt.");
        return;
      }

      flash(
        "success",
        status === "published"
          ? "Nieuwsbericht gepubliceerd."
          : "Nieuwsbericht opgeslagen.",
      );
      refreshList(result.data.id);
    });
  }

  function archiveSelected(postId: string) {
    if (!canDelete) return;

    startTransition(async () => {
      const result = await archiveNewsPost(postId);
      if (!result.success) {
        flash("error", result.message ?? "Archiveren mislukt.");
        setArchiveTargetId(null);
        return;
      }
      flash("success", "Nieuwsbericht gearchiveerd.");
      refreshList(postId);
      setArchiveTargetId(null);
    });
  }

  async function handleHeroFile(file: File | null) {
    if (!file) return;
    setUploadingHero(true);

    const data = new FormData();
    data.append("file", file);
    const result = await uploadNewsHeroImage(data);
    setUploadingHero(false);
    if (!result.success) {
      flash("error", result.message ?? "Hero image upload mislukt.");
      return;
    }
    if (!result.data) {
      flash("error", "Hero image upload mislukt.");
      return;
    }
    updateForm({
      heroImageUrl: result.data.url,
      heroImagePath: result.data.path,
    });
    flash("success", "Hero image geupload.");
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-semibold text-[#081D3A]">
                Nieuws
              </h2>
              <p className="text-xs text-[#64748B]">{posts.length} berichten</p>
            </div>
            {canWrite && (
              <Button type="button" size="sm" onClick={startNewPost}>
                <Plus className="h-4 w-4" />
                Nieuw
              </Button>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Zoek op titel of doelgroep"
            />
          </div>
        </div>

        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-2">
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] p-8 text-center">
              <Newspaper className="mb-2 h-8 w-8 text-[#94A3B8]" />
              <p className="text-sm font-semibold text-[#334155]">
                Geen nieuwsberichten
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Maak het eerste tenantbericht aan.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => selectPost(post.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selectedId === post.id
                      ? "border-[#00B7B3] bg-[#E0FAFB]"
                      : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#081D3A]">
                        {post.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#64748B]">
                        {post.excerpt || "Geen intro ingevuld."}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "border text-[10px]",
                        STATUS_STYLES[post.status],
                      )}
                      variant="outline"
                    >
                      {STATUS_LABELS[post.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#64748B]">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{post.audienceSummary}</span>
                    </span>
                    <span className="flex-shrink-0">
                      {formatDate(post.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] p-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-[#081D3A]">
              {form.id ? "Nieuwsbericht bewerken" : "Nieuw nieuwsbericht"}
            </h2>
            <p className="text-sm text-[#64748B]">
              TipTap content, hero image en doelgroepregels voor personeel en
              klanten.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {form.id && selectedPost && (
              <Badge
                className={cn("border", STATUS_STYLES[selectedPost.status])}
                variant="outline"
              >
                {STATUS_LABELS[selectedPost.status]}
              </Badge>
            )}
            {canDelete && form.id && form.status !== "archived" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setArchiveTargetId(form.id)}
                disabled={isPending}
              >
                <Archive className="h-4 w-4" />
                Archiveer
              </Button>
            )}
            {canWrite && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submit()}
                disabled={isPending || !canEdit}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Opslaan
              </Button>
            )}
            {canSend && (
              <Button
                type="button"
                size="sm"
                onClick={() => submit("published")}
                disabled={isPending || !canEdit}
              >
                <Send className="h-4 w-4" />
                Publiceer
              </Button>
            )}
          </div>
        </div>

        {message && (
          <div
            className={cn(
              "mx-4 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Titel
                </span>
                <Input
                  value={form.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  disabled={!canEdit}
                  placeholder="Bijvoorbeeld: Nieuwe veiligheidsinstructie voor avondrondes"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Slug
                </span>
                <Input
                  value={form.slug}
                  onChange={(event) =>
                    updateForm({ slug: slugify(event.target.value) })
                  }
                  disabled={!canEdit}
                  placeholder="automatisch"
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                Korte introductie
              </span>
              <Textarea
                value={form.excerpt}
                onChange={(event) =>
                  updateForm({ excerpt: event.target.value })
                }
                disabled={!canEdit}
                rows={3}
                placeholder="Maximaal twee regels voor de nieuwskaart en PWA-overzicht."
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                Bericht
              </span>
              <TipTapNewsEditor
                key={editorKey}
                initialHtml={form.contentHtml}
                initialJson={form.contentJson}
                disabled={!canEdit}
                onChange={(html, json) =>
                  updateForm({ contentHtml: html, contentJson: json })
                }
              />
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading text-sm font-semibold text-[#081D3A]">
                    Doelgroepen
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Combineer brede groepen met specifieke sectoren,
                    personeelsleden of klanten.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-[#BFEFED] bg-white text-[#007E7A]"
                >
                  {countAudience(form.audience)} selectie
                  {countAudience(form.audience) === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3">
                  <CheckboxAdapter
                    type="checkbox"
                    checked={form.audience.allPersonnel}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateAudience({ allPersonnel: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-[#CBD5E1] accent-[#00B7B3]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#081D3A]">
                      Alle medewerkers
                    </span>
                    <span className="block text-xs text-[#64748B]">
                      Personeel-PWA en interne gebruikers
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3">
                  <CheckboxAdapter
                    type="checkbox"
                    checked={form.audience.allCustomers}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateAudience({ allCustomers: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-[#CBD5E1] accent-[#00B7B3]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#081D3A]">
                      Alle klanten
                    </span>
                    <span className="block text-xs text-[#64748B]">
                      Klantportaal zodra nieuws daar wordt getoond
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <TargetPicker
                  title="Sectoren"
                  options={audienceOptions.sectors}
                  value={form.audience.sectorIds}
                  disabled={!canEdit}
                  onChange={(sectorIds) => updateAudience({ sectorIds })}
                />
                <TargetPicker
                  title="Personeel"
                  options={audienceOptions.personnel}
                  value={form.audience.personnelIds}
                  disabled={!canEdit}
                  onChange={(personnelIds) => updateAudience({ personnelIds })}
                />
                <TargetPicker
                  title="Klanten"
                  options={audienceOptions.customers}
                  value={form.audience.customerIds}
                  disabled={!canEdit}
                  onChange={(customerIds) => updateAudience({ customerIds })}
                />
                <TargetPicker
                  title="Klanttypes"
                  options={audienceOptions.customerTypes}
                  value={form.audience.customerTypeIds}
                  disabled={!canEdit}
                  onChange={(customerTypeIds) =>
                    updateAudience({ customerTypeIds })
                  }
                />
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
              <h3 className="font-heading text-sm font-semibold text-[#081D3A]">
                Publicatie
              </h3>
              <div className="mt-3 space-y-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Status
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm({
                        status: event.target.value as NewsPostStatus,
                      })
                    }
                    disabled={!canEdit}
                    className="veele-input"
                  >
                    <option value="draft">Concept</option>
                    <option value="scheduled" disabled={!canSend}>
                      Gepland
                    </option>
                    <option value="published" disabled={!canSend}>
                      Gepubliceerd
                    </option>
                    <option value="archived" disabled={!canDelete}>
                      Gearchiveerd
                    </option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Publicatiemoment
                  </span>
                  <Input
                    type="datetime-local"
                    value={form.publishAt}
                    onChange={(event) =>
                      updateForm({ publishAt: event.target.value })
                    }
                    disabled={!canEdit}
                  />
                </label>
                <div className="rounded-lg bg-[#F8FAFC] p-3 text-xs text-[#64748B]">
                  <p className="flex items-center gap-2 font-medium text-[#334155]">
                    <MailCheck className="h-4 w-4 text-[#00B7B3]" />
                    Doelgroep wordt opgeslagen
                  </p>
                  <p className="mt-1">
                    Push/e-mail distributie kan hier later op aansluiten zonder
                    nieuws opnieuw te modelleren.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
              <h3 className="font-heading text-sm font-semibold text-[#081D3A]">
                Hero image
              </h3>
              <p className="mt-1 text-xs text-[#64748B]">
                JPG, PNG, WebP of GIF tot 5 MB.
              </p>

              <input
                ref={heroInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={!canEdit}
                onChange={(event) => {
                  void handleHeroFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />

              <div className="mt-3 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                {form.heroImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.heroImageUrl}
                    alt=""
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 flex-col items-center justify-center text-center text-[#94A3B8]">
                    <ImagePlus className="mb-2 h-8 w-8" />
                    <p className="text-sm font-semibold">Geen hero image</p>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || uploadingHero}
                  onClick={() => heroInputRef.current?.click()}
                >
                  {uploadingHero ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  Upload
                </Button>
                {form.heroImageUrl && canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateForm({ heroImageUrl: "", heroImagePath: "" })
                    }
                  >
                    Verwijder
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <h3 className="font-heading text-sm font-semibold text-[#081D3A]">
                Statusinformatie
              </h3>
              <div className="mt-3 space-y-2 text-xs text-[#64748B]">
                <p className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-[#94A3B8]" />
                  Bijgewerkt:{" "}
                  {selectedPost ? formatDate(selectedPost.updatedAt) : "-"}
                </p>
                <p className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#94A3B8]" />
                  {selectedPost?.audienceSummary ??
                    "Alle medewerkers als standaard"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <TenantConfirmDialog
        open={!!archiveTargetId}
        onOpenChange={(open) => {
          if (!open) setArchiveTargetId(null);
        }}
        title="Nieuwsbericht archiveren?"
        description="Het bericht verdwijnt uit actieve lijsten, maar blijft bewaard in de historie."
        confirmLabel="Archiveren"
        destructive
        onConfirm={() => {
          if (archiveTargetId) archiveSelected(archiveTargetId);
        }}
      />
    </div>
  );
}
