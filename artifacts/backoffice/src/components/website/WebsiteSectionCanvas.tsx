"use client";

import type {
  WebsiteAction,
  WebsiteEditorSectionKey,
  WebsiteRichTextDocument,
  WebsiteSection,
} from "@workspace/db";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  createWebsiteSectionAction,
  deleteWebsiteSectionAction,
  reorderWebsiteSectionsAction,
  updateWebsiteSectionAction,
} from "@/app/actions/website";
import { Button } from "@/components/ui/button";
import { TenantConfirmDialog } from "@/components/tenant-ui";
import { cn } from "@/lib/utils";
import { WebsiteRichTextEditor } from "./WebsiteRichTextEditor";
import {
  EMPTY_RICH_TEXT_DOCUMENT,
  WEBSITE_SECTION_LABELS,
  createDefaultWebsiteSection,
} from "./website-section-defaults";

type CanvasSection = WebsiteSection & {
  position: number;
  authoringRevision: number;
};

type Props = {
  siteId: string;
  pageId: string;
  siteAuthoringRevision: number;
  pageAuthoringRevision: number;
  sections: CanvasSection[];
  canWrite: boolean;
};

type ContentRecord = Record<string, unknown>;
type ItemRecord = Record<string, unknown>;

const SECTION_TYPES = Object.entries(WEBSITE_SECTION_LABELS) as Array<
  [WebsiteEditorSectionKey, string]
>;

const SECTION_VARIANTS: Record<WebsiteEditorSectionKey, string[]> = {
  hero: ["centered", "split", "visual", "service", "minimal"],
  emergency_hero: ["urgent", "compact"],
  trust_bar: ["logos", "reviews", "short_points"],
  services_grid: ["cards", "icons", "editorial", "compact"],
  feature_grid: ["two_column", "three_column"],
  process_steps: ["numbered", "timeline"],
  testimonials: ["cards", "featured"],
  faq: ["accordion", "list"],
  cta_banner: ["solid", "split"],
  contact_form: ["card", "split_contact"],
  service_area: ["list", "grid"],
  project_showcase: ["editorial", "cards"],
  blog_preview: ["cards", "editorial"],
  rich_text: ["default", "narrow"],
  stats: ["inline", "cards"],
  team: ["cards", "compact"],
  logo_wall: ["logos", "certifications"],
};

const VARIANT_LABELS: Record<string, string> = {
  centered: "Gecentreerd",
  split: "Twee kolommen",
  visual: "Visueel",
  service: "Dienst",
  minimal: "Minimaal",
  logos: "Logo's",
  reviews: "Beoordelingen",
  short_points: "Kernpunten",
  cards: "Kaarten",
  icons: "Iconen",
  editorial: "Redactioneel",
  compact: "Compact",
  two_column: "Twee kolommen",
  three_column: "Drie kolommen",
  numbered: "Genummerd",
  timeline: "Tijdlijn",
  featured: "Uitgelicht",
  accordion: "Uitklapbaar",
  list: "Lijst",
  solid: "Vol vlak",
  card: "Kaart",
  split_contact: "Contact verdeeld",
  default: "Standaard",
  narrow: "Smalle leeskolom",
  urgent: "Urgent",
  grid: "Raster",
  inline: "Op één regel",
  certifications: "Certificeringen",
};

const FLAT_INPUT =
  "w-full border-0 bg-transparent px-0 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60";

function contentRecord(section: WebsiteSection): ContentRecord {
  return section.content as unknown as ContentRecord;
}

function withContent(
  section: WebsiteSection,
  patch: ContentRecord,
): WebsiteSection {
  return {
    ...section,
    content: { ...contentRecord(section), ...patch },
  } as WebsiteSection;
}

function records(value: unknown): ItemRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ItemRecord => Boolean(item) && typeof item === "object",
      )
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function asRichDocument(
  value: unknown,
): Extract<WebsiteRichTextDocument, { schemaVersion: 2 }> {
  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "doc"
  ) {
    const document = value as WebsiteRichTextDocument;
    if (document.schemaVersion === 1) {
      return {
        type: "doc",
        schemaVersion: 2,
        content: document.content.map((paragraph) => ({
          type: "paragraph",
          content: paragraph.content.map((node) => ({
            type: "text",
            text: node.text,
            marks: node.marks?.map((mark) => ({ type: mark })),
          })),
        })),
      };
    }
    return document;
  }
  if (typeof value === "string" && value.trim()) {
    return {
      type: "doc",
      schemaVersion: 2,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: value }],
        },
      ],
    };
  }
  return EMPTY_RICH_TEXT_DOCUMENT;
}

function MutationMessage({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  if (!error && !message) return null;
  return (
    <p
      aria-live="polite"
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {error ?? message}
    </p>
  );
}

export function WebsiteSectionCanvas({
  siteId,
  pageId,
  siteAuthoringRevision,
  pageAuthoringRevision,
  sections: initialSections,
  canWrite,
}: Props) {
  const router = useRouter();
  const [sections, setSections] = useState(
    [...initialSections].sort((left, right) => left.position - right.position),
  );
  const [siteRevision, setSiteRevision] = useState(siteAuthoringRevision);
  const [pageRevision, setPageRevision] = useState(pageAuthoringRevision);
  const [adding, setAdding] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSections(
      [...initialSections].sort(
        (left, right) => left.position - right.position,
      ),
    );
    setSiteRevision(siteAuthoringRevision);
    setPageRevision(pageAuthoringRevision);
  }, [initialSections, pageAuthoringRevision, siteAuthoringRevision]);

  function acceptRevisions(data: {
    siteAuthoringRevision: number;
    pageAuthoringRevision: number;
  }) {
    setSiteRevision(data.siteAuthoringRevision);
    setPageRevision(data.pageAuthoringRevision);
  }

  function createSection(type: WebsiteEditorSectionKey) {
    setError(null);
    setMessage(null);
    const section = createDefaultWebsiteSection(type, crypto.randomUUID());
    startTransition(async () => {
      const result = await createWebsiteSectionAction({
        siteId,
        pageId,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: pageRevision,
        section,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) return;
      acceptRevisions(result.data);
      setAdding(false);
      setMessage(`${WEBSITE_SECTION_LABELS[type]} toegevoegd.`);
      router.refresh();
    });
  }

  function persistOrder(next: CanvasSection[]) {
    const previous = sections;
    const normalized = next.map((section, position) => ({
      ...section,
      position,
    }));
    setSections(normalized);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await reorderWebsiteSectionsAction({
        siteId,
        pageId,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: pageRevision,
        sectionIds: normalized.map((section) => section.id),
      });
      if (!result.success) {
        setSections(previous);
        setError(result.message);
        return;
      }
      if (!result.data) return;
      acceptRevisions(result.data);
      setMessage("Volgorde opgeslagen.");
      router.refresh();
    });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length || isPending) return;
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    persistOrder(next);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = draggingId;
    setDraggingId(null);
    if (!sourceId || sourceId === targetId || isPending) return;
    const sourceIndex = sections.findIndex(
      (section) => section.id === sourceId,
    );
    const targetIndex = sections.findIndex(
      (section) => section.id === targetId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...sections];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    persistOrder(next);
  }

  return (
    <section className="veele-card space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Content</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bewerk direct op het canvas. Opslaan wijzigt alleen het concept en
            publiceert niets.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!canWrite || isPending}
          onClick={() => setAdding((current) => !current)}
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? "Sluiten" : "Sectie toevoegen"}
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTION_TYPES.map(([type, label]) => (
            <button
              key={type}
              type="button"
              disabled={!canWrite || isPending}
              onClick={() => createSection(type)}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:text-cyan-800 hover:ring-1 hover:ring-cyan-200 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 text-cyan-600" />
              {label}
            </button>
          ))}
        </div>
      )}

      <MutationMessage error={error} message={message} />

      {sections.length === 0 ? (
        <button
          type="button"
          disabled={!canWrite}
          onClick={() => setAdding(true)}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 transition hover:border-cyan-300 hover:text-cyan-800 disabled:pointer-events-none"
        >
          <Plus className="h-6 w-6" />
          Voeg de eerste contentsectie toe
        </button>
      ) : (
        <ol className="space-y-3">
          {sections.map((section, index) => (
            <li
              key={section.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, section.id)}
              className={cn(
                "transition",
                draggingId === section.id && "opacity-40",
              )}
            >
              <WebsiteSectionCard
                section={section}
                siteId={siteId}
                pageId={pageId}
                siteRevision={siteRevision}
                pageRevision={pageRevision}
                canWrite={canWrite}
                busy={isPending}
                canMoveUp={index > 0}
                canMoveDown={index < sections.length - 1}
                onMoveUp={() => moveSection(index, -1)}
                onMoveDown={() => moveSection(index, 1)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", section.id);
                  setDraggingId(section.id);
                }}
                onDragEnd={() => setDraggingId(null)}
                onSaved={(saved, revisions) => {
                  acceptRevisions(revisions);
                  setSections((current) =>
                    current.map((candidate) =>
                      candidate.id === saved.id ? saved : candidate,
                    ),
                  );
                  setMessage("Sectie opgeslagen.");
                  setError(null);
                  router.refresh();
                }}
                onDeleted={(id, revisions) => {
                  acceptRevisions(revisions);
                  setSections((current) =>
                    current
                      .filter((candidate) => candidate.id !== id)
                      .map((candidate, position) => ({
                        ...candidate,
                        position,
                      })),
                  );
                  setMessage("Sectie verwijderd.");
                  setError(null);
                  router.refresh();
                }}
                onError={setError}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type RevisionResult = {
  siteAuthoringRevision: number;
  pageAuthoringRevision: number;
};

function WebsiteSectionCard({
  section,
  siteId,
  pageId,
  siteRevision,
  pageRevision,
  canWrite,
  busy,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onSaved,
  onDeleted,
  onError,
}: {
  section: CanvasSection;
  siteId: string;
  pageId: string;
  siteRevision: number;
  pageRevision: number;
  canWrite: boolean;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onSaved: (section: CanvasSection, revisions: RevisionResult) => void;
  onDeleted: (id: string, revisions: RevisionResult) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<WebsiteSection>(section);
  const [expanded, setExpanded] = useState(true);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const disabled = !canWrite || busy || isPending;

  useEffect(() => setDraft(section), [section]);

  function save() {
    startTransition(async () => {
      const result = await updateWebsiteSectionAction({
        siteId,
        pageId,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: pageRevision,
        expectedSectionRevision: section.authoringRevision,
        section: draft,
      });
      if (!result.success) {
        onError(result.message);
        return;
      }
      if (!result.data) return;
      onSaved(
        {
          ...draft,
          position: section.position,
          authoringRevision:
            result.data.sectionAuthoringRevision ?? section.authoringRevision,
        },
        result.data,
      );
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteWebsiteSectionAction({
        siteId,
        pageId,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: pageRevision,
        sectionId: section.id,
        expectedSectionRevision: section.authoringRevision,
      });
      if (!result.success) {
        onError(result.message);
        return;
      }
      if (!result.data) return;
      onDeleted(section.id, result.data);
    });
  }

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(section),
    [draft, section],
  );

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white shadow-sm transition focus-within:border-cyan-200 focus-within:shadow-md">
      <header className="flex items-center gap-1 px-2 py-2 sm:px-3">
        <button
          type="button"
          draggable={canWrite && !busy}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          disabled={!canWrite || busy}
          aria-label={`${WEBSITE_SECTION_LABELS[draft.type]} verslepen`}
          className="cursor-grab rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-default"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left"
        >
          <span className="truncate text-sm font-semibold text-slate-900">
            {WEBSITE_SECTION_LABELS[draft.type]}
          </span>
          {!draft.visible && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              Verborgen
            </span>
          )}
          {dirty && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              aria-label="Niet opgeslagen"
            />
          )}
          {expanded ? (
            <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
          )}
        </button>
        <IconButton
          label="Omhoog"
          disabled={disabled || !canMoveUp}
          onClick={onMoveUp}
        >
          <ArrowUp className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Omlaag"
          disabled={disabled || !canMoveDown}
          onClick={onMoveDown}
        >
          <ArrowDown className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={draft.visible ? "Sectie verbergen" : "Sectie tonen"}
          disabled={disabled}
          onClick={() =>
            setDraft({ ...draft, visible: !draft.visible } as WebsiteSection)
          }
        >
          {draft.visible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </IconButton>
      </header>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-500">
              Weergave
              <select
                value={draft.variant}
                disabled={disabled}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    variant: event.target.value,
                  } as WebsiteSection)
                }
                className="ml-2 rounded-md border-0 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-cyan-300"
              >
                {SECTION_VARIANTS[draft.type].map((variant) => (
                  <option key={variant} value={variant}>
                    {VARIANT_LABELS[variant] ?? variant}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-400">
              Revisie {section.authoringRevision}
            </span>
            <Toggle
              label="Inhoud gecontroleerd"
              checked={!draft.requiresReview}
              disabled={disabled}
              onChange={(checked) =>
                setDraft({
                  ...draft,
                  requiresReview: !checked,
                } as WebsiteSection)
              }
            />
          </div>

          <SectionContentEditor
            section={draft}
            disabled={disabled}
            onChange={setDraft}
          />

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRemoveDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Verwijderen
            </button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || !dirty}
              onClick={save}
            >
              {isPending ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isPending ? "Opslaan…" : "Sectie opslaan"}
            </Button>
          </footer>
        </div>
      )}
      <TenantConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="Sectie verwijderen?"
        description="Deze sectie wordt uit het concept verwijderd. Niet-opgeslagen inhoud in deze sectie gaat verloren."
        confirmLabel="Verwijderen"
        destructive
        confirmDisabled={disabled}
        onConfirm={remove}
      />
    </article>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

type ScalarField = {
  key: string;
  label: string;
  placeholder?: string;
  kind?: "text" | "textarea" | "number";
  required?: boolean;
};

const SCALAR_FIELDS: Record<WebsiteEditorSectionKey, ScalarField[]> = {
  hero: [
    { key: "eyebrow", label: "Bovenregel", placeholder: "Kleine introductie" },
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
    { key: "trustText", label: "Vertrouwenstekst" },
  ],
  emergency_hero: [
    { key: "eyebrow", label: "Bovenregel" },
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
    {
      key: "availabilityNotice",
      label: "Actuele bereikbaarheidsmelding",
      kind: "textarea",
      required: true,
    },
  ],
  trust_bar: [
    { key: "title", label: "Titel" },
    { key: "reviewScore", label: "Beoordeling", kind: "number" },
    { key: "reviewCount", label: "Aantal beoordelingen", kind: "number" },
  ],
  services_grid: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  feature_grid: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  process_steps: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  testimonials: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  faq: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  cta_banner: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  contact_form: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  service_area: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  project_showcase: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  blog_preview: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
    { key: "limit", label: "Aantal berichten", kind: "number", required: true },
  ],
  rich_text: [{ key: "title", label: "Optionele titel" }],
  stats: [{ key: "title", label: "Optionele titel" }],
  team: [
    { key: "title", label: "Titel", required: true },
    { key: "subtitle", label: "Inleiding", kind: "textarea" },
  ],
  logo_wall: [{ key: "title", label: "Optionele titel" }],
};

function SectionContentEditor({
  section,
  disabled,
  onChange,
}: {
  section: WebsiteSection;
  disabled: boolean;
  onChange: (section: WebsiteSection) => void;
}) {
  const content = contentRecord(section);
  function patch(patchValue: ContentRecord) {
    onChange(withContent(section, patchValue));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {SCALAR_FIELDS[section.type].map((field) => (
          <FlatField
            key={field.key}
            label={field.label}
            required={field.required}
          >
            {field.kind === "textarea" ? (
              <textarea
                value={text(content[field.key])}
                disabled={disabled}
                rows={2}
                maxLength={2_000}
                placeholder={field.placeholder}
                onChange={(event) =>
                  patch({ [field.key]: event.target.value || undefined })
                }
                className={cn(FLAT_INPUT, "resize-y")}
              />
            ) : (
              <input
                type={field.kind === "number" ? "number" : "text"}
                value={
                  field.kind === "number"
                    ? numberValue(content[field.key])
                    : text(content[field.key])
                }
                disabled={disabled}
                required={field.required}
                maxLength={field.kind === "number" ? undefined : 2_000}
                step={field.key === "reviewScore" ? "0.1" : undefined}
                min={
                  field.key === "reviewScore"
                    ? 0
                    : field.key === "limit"
                      ? 1
                      : undefined
                }
                max={
                  field.key === "reviewScore"
                    ? 5
                    : field.key === "limit"
                      ? 9
                      : undefined
                }
                placeholder={field.placeholder}
                onChange={(event) => {
                  const value = event.target.value;
                  patch({
                    [field.key]:
                      field.kind === "number"
                        ? value === ""
                          ? undefined
                          : Number(value)
                        : value || undefined,
                  });
                }}
                className={cn(
                  FLAT_INPUT,
                  field.key === "title" &&
                    "text-lg font-semibold text-slate-950",
                )}
              />
            )}
          </FlatField>
        ))}
      </div>

      {(["hero", "emergency_hero", "trust_bar"] as const).includes(
        section.type as "hero" | "emergency_hero" | "trust_bar",
      ) && (
        <FlatField
          label={section.type === "trust_bar" ? "Kernpunten" : "Badges"}
          hint="Eén item per regel"
        >
          <textarea
            rows={3}
            disabled={disabled}
            value={
              (section.type === "hero" || section.type === "emergency_hero"
                ? (content.badges as string[] | undefined)
                : (content.shortClaims as string[] | undefined)
              )?.join("\n") ?? ""
            }
            onChange={(event) =>
              patch({
                [section.type === "trust_bar" ? "shortClaims" : "badges"]:
                  event.target.value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
              })
            }
            className={cn(FLAT_INPUT, "resize-y")}
          />
        </FlatField>
      )}

      {section.type === "rich_text" && (
        <FlatField label="Inhoud" group>
          <WebsiteRichTextEditor
            value={asRichDocument(content.body)}
            disabled={disabled}
            ariaLabel="Vrije tekst"
            onChange={(body) => patch({ body })}
          />
        </FlatField>
      )}

      {section.type === "hero" && (
        <div className="grid gap-4 md:grid-cols-2">
          <ActionEditor
            label="Primaire actie"
            action={content.primaryAction as WebsiteAction | undefined}
            disabled={disabled}
            onChange={(primaryAction) => patch({ primaryAction })}
          />
          <ActionEditor
            label="Secundaire actie"
            action={content.secondaryAction as WebsiteAction | undefined}
            optional
            disabled={disabled}
            onChange={(secondaryAction) => patch({ secondaryAction })}
          />
        </div>
      )}

      {section.type === "emergency_hero" && (
        <div className="grid gap-4 md:grid-cols-2">
          <ActionEditor
            label="Telefoonactie"
            action={content.phoneAction as WebsiteAction | undefined}
            disabled={disabled}
            allowedKinds={["phone"]}
            onChange={(phoneAction) => patch({ phoneAction })}
          />
          <ActionEditor
            label="Secundaire actie"
            action={content.secondaryAction as WebsiteAction | undefined}
            optional
            disabled={disabled}
            onChange={(secondaryAction) => patch({ secondaryAction })}
          />
        </div>
      )}

      {(section.type === "cta_banner" ||
        section.type === "service_area" ||
        section.type === "blog_preview") && (
        <div className="grid gap-4 md:grid-cols-2">
          <ActionEditor
            label={section.type === "cta_banner" ? "Primaire actie" : "Actie"}
            action={
              content[
                section.type === "cta_banner" ? "primaryAction" : "action"
              ] as WebsiteAction | undefined
            }
            optional={section.type !== "cta_banner"}
            disabled={disabled}
            onChange={(action) =>
              patch(
                section.type === "cta_banner"
                  ? { primaryAction: action }
                  : { action },
              )
            }
          />
          {section.type === "cta_banner" && (
            <ActionEditor
              label="Secundaire actie"
              action={content.secondaryAction as WebsiteAction | undefined}
              optional
              disabled={disabled}
              onChange={(secondaryAction) => patch({ secondaryAction })}
            />
          )}
        </div>
      )}

      {section.type === "service_area" && (
        <FlatField label="Plaatsen en regio's" hint="Eén item per regel">
          <textarea
            rows={5}
            disabled={disabled}
            value={(content.areas as string[] | undefined)?.join("\n") ?? ""}
            onChange={(event) =>
              patch({
                areas: event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            className={cn(FLAT_INPUT, "resize-y")}
          />
        </FlatField>
      )}

      {section.type === "contact_form" && (
        <div className="flex flex-wrap gap-4">
          <Toggle
            label="Contactgegevens tonen"
            checked={content.showContactDetails === true}
            disabled={disabled}
            onChange={(showContactDetails) => patch({ showContactDetails })}
          />
          <Toggle
            label="Openingstijden tonen"
            checked={content.showOpeningHours === true}
            disabled={disabled}
            onChange={(showOpeningHours) => patch({ showOpeningHours })}
          />
        </div>
      )}

      <SectionCollectionEditor
        section={section}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

type CollectionDefinition = {
  key: string;
  label: string;
  itemLabel: string;
  min: number;
  max: number;
  create: () => ItemRecord;
  fields: Array<{
    key: string;
    label: string;
    kind?: "text" | "textarea" | "number" | "icon" | "date" | "boolean";
  }>;
};

const COLLECTIONS: Partial<
  Record<WebsiteEditorSectionKey, CollectionDefinition>
> = {
  trust_bar: {
    key: "items",
    label: "Bewijzen",
    itemLabel: "Bewijs",
    min: 2,
    max: 8,
    create: () => ({ name: "Nieuw bewijs", decorative: false }),
    fields: [
      { key: "name", label: "Naam" },
      { key: "description", label: "Toelichting", kind: "textarea" },
    ],
  },
  services_grid: {
    key: "services",
    label: "Diensten",
    itemLabel: "Dienst",
    min: 2,
    max: 12,
    create: () => ({ title: "Nieuwe dienst", description: "Beschrijving" }),
    fields: [
      { key: "title", label: "Titel" },
      { key: "description", label: "Beschrijving", kind: "textarea" },
      { key: "icon", label: "Icoon", kind: "icon" },
    ],
  },
  feature_grid: {
    key: "features",
    label: "Kenmerken",
    itemLabel: "Kenmerk",
    min: 2,
    max: 9,
    create: () => ({
      title: "Nieuw kenmerk",
      description: "Beschrijving",
      icon: "badge_check",
    }),
    fields: [
      { key: "title", label: "Titel" },
      { key: "description", label: "Beschrijving", kind: "textarea" },
      { key: "icon", label: "Icoon", kind: "icon" },
    ],
  },
  process_steps: {
    key: "steps",
    label: "Stappen",
    itemLabel: "Stap",
    min: 2,
    max: 8,
    create: () => ({ title: "Nieuwe stap", description: "Beschrijving" }),
    fields: [
      { key: "title", label: "Titel" },
      { key: "description", label: "Beschrijving", kind: "textarea" },
      { key: "icon", label: "Icoon", kind: "icon" },
    ],
  },
  testimonials: {
    key: "testimonials",
    label: "Klantverhalen",
    itemLabel: "Klantverhaal",
    min: 1,
    max: 6,
    create: () => ({ quote: "Klantervaring", name: "Naam klant" }),
    fields: [
      { key: "quote", label: "Citaat", kind: "textarea" },
      { key: "name", label: "Naam" },
      { key: "companyOrLocation", label: "Bedrijf of plaats" },
      { key: "rating", label: "Beoordeling", kind: "number" },
    ],
  },
  faq: {
    key: "items",
    label: "Vragen",
    itemLabel: "Vraag",
    min: 1,
    max: 20,
    create: () => ({
      question: "Nieuwe vraag",
      answer: EMPTY_RICH_TEXT_DOCUMENT,
    }),
    fields: [{ key: "question", label: "Vraag" }],
  },
  project_showcase: {
    key: "projects",
    label: "Projecten",
    itemLabel: "Project",
    min: 1,
    max: 12,
    create: () => ({
      title: "Nieuw project",
      description:
        "Beschrijf uitsluitend een project dat gepubliceerd mag worden.",
    }),
    fields: [
      { key: "title", label: "Titel" },
      { key: "description", label: "Beschrijving", kind: "textarea" },
      { key: "location", label: "Plaats" },
    ],
  },
  stats: {
    key: "items",
    label: "Kengetallen",
    itemLabel: "Kengetal",
    min: 1,
    max: 8,
    create: () => ({
      value: "Waarde",
      label: "Omschrijving",
      sourceNote: "Noteer bron en peildatum.",
    }),
    fields: [
      { key: "value", label: "Waarde" },
      { key: "label", label: "Omschrijving" },
      { key: "sourceNote", label: "Bron en peildatum", kind: "textarea" },
    ],
  },
  team: {
    key: "members",
    label: "Teamleden met bevestigde publicatietoestemming",
    itemLabel: "Teamlid",
    min: 0,
    max: 24,
    create: () => ({
      name: "Naam teamlid",
      role: "Functie",
      consentConfirmed: false,
    }),
    fields: [
      { key: "name", label: "Naam" },
      { key: "role", label: "Functie" },
      { key: "bio", label: "Korte introductie", kind: "textarea" },
      {
        key: "consentConfirmed",
        label: "Publicatietoestemming bevestigd",
        kind: "boolean",
      },
    ],
  },
  logo_wall: {
    key: "items",
    label: "Logo's en certificeringen",
    itemLabel: "Vermelding",
    min: 1,
    max: 24,
    create: () => ({
      name: "Naam",
      description: "Controleer publicatierecht en geldigheid.",
    }),
    fields: [
      { key: "name", label: "Naam" },
      { key: "description", label: "Toelichting", kind: "textarea" },
      { key: "validUntil", label: "Geldig tot", kind: "date" },
    ],
  },
};

const ICONS = [
  "badge_check",
  "calendar_check",
  "clock",
  "home",
  "map_pin",
  "phone",
  "shield_check",
  "sparkles",
  "tools",
  "users",
] as const;

function SectionCollectionEditor({
  section,
  disabled,
  onChange,
}: {
  section: WebsiteSection;
  disabled: boolean;
  onChange: (section: WebsiteSection) => void;
}) {
  const definition = COLLECTIONS[section.type];
  if (!definition) return null;
  const collectionKey = definition.key;
  const content = contentRecord(section);
  const items = records(content[collectionKey]);
  function update(next: ItemRecord[]) {
    onChange(withContent(section, { [collectionKey]: next }));
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {definition.label}
        </h3>
        <button
          type="button"
          disabled={disabled || items.length >= definition.max}
          onClick={() => update([...items, definition.create()])}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {definition.itemLabel} toevoegen
        </button>
      </div>
      {items.map((item, itemIndex) => (
        <div key={itemIndex} className="rounded-lg bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              {definition.itemLabel} {itemIndex + 1}
            </span>
            <button
              type="button"
              aria-label={`${definition.itemLabel} verwijderen`}
              disabled={disabled || items.length <= definition.min}
              onClick={() =>
                update(items.filter((_, index) => index !== itemIndex))
              }
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {definition.fields.map((field) => (
              <FlatField key={field.key} label={field.label}>
                {field.kind === "textarea" ? (
                  <textarea
                    value={text(item[field.key])}
                    disabled={disabled}
                    rows={2}
                    onChange={(event) =>
                      update(
                        items.map((candidate, index) =>
                          index === itemIndex
                            ? {
                                ...candidate,
                                [field.key]: event.target.value || undefined,
                              }
                            : candidate,
                        ),
                      )
                    }
                    className={cn(FLAT_INPUT, "resize-y")}
                  />
                ) : field.kind === "icon" ? (
                  <select
                    value={text(item[field.key])}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        items.map((candidate, index) =>
                          index === itemIndex
                            ? {
                                ...candidate,
                                [field.key]: event.target.value || undefined,
                              }
                            : candidate,
                        ),
                      )
                    }
                    className={FLAT_INPUT}
                  >
                    {section.type !== "feature_grid" && (
                      <option value="">Geen icoon</option>
                    )}
                    {ICONS.map((icon) => (
                      <option key={icon} value={icon}>
                        {icon.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : field.kind === "boolean" ? (
                  <Toggle
                    label={field.label}
                    checked={item[field.key] === true}
                    disabled={disabled}
                    onChange={(checked) =>
                      update(
                        items.map((candidate, index) =>
                          index === itemIndex
                            ? { ...candidate, [field.key]: checked }
                            : candidate,
                        ),
                      )
                    }
                  />
                ) : (
                  <input
                    type={
                      field.kind === "number"
                        ? "number"
                        : field.kind === "date"
                          ? "date"
                          : "text"
                    }
                    value={
                      field.kind === "number"
                        ? numberValue(item[field.key])
                        : text(item[field.key])
                    }
                    min={field.key === "rating" ? 1 : undefined}
                    max={field.key === "rating" ? 5 : undefined}
                    disabled={disabled}
                    onChange={(event) => {
                      const value = event.target.value;
                      update(
                        items.map((candidate, index) =>
                          index === itemIndex
                            ? {
                                ...candidate,
                                [field.key]:
                                  field.kind === "number"
                                    ? value === ""
                                      ? undefined
                                      : Number(value)
                                    : value || undefined,
                              }
                            : candidate,
                        ),
                      );
                    }}
                    className={FLAT_INPUT}
                  />
                )}
              </FlatField>
            ))}
            {section.type === "faq" && (
              <FlatField label="Antwoord" group>
                <WebsiteRichTextEditor
                  value={asRichDocument(item.answer)}
                  disabled={disabled}
                  placeholder="Schrijf het antwoord…"
                  ariaLabel={`Antwoord op vraag ${itemIndex + 1}`}
                  onChange={(answer) =>
                    update(
                      items.map((candidate, index) =>
                        index === itemIndex
                          ? { ...candidate, answer }
                          : candidate,
                      ),
                    )
                  }
                />
              </FlatField>
            )}
            {section.type === "services_grid" && (
              <ActionEditor
                label="Actie"
                action={item.action as WebsiteAction | undefined}
                optional
                disabled={disabled}
                onChange={(action) =>
                  update(
                    items.map((candidate, index) =>
                      index === itemIndex
                        ? { ...candidate, action }
                        : candidate,
                    ),
                  )
                }
              />
            )}
            {section.type === "project_showcase" && (
              <ActionEditor
                label="Actie"
                action={item.action as WebsiteAction | undefined}
                optional
                disabled={disabled}
                onChange={(action) =>
                  update(
                    items.map((candidate, index) =>
                      index === itemIndex
                        ? { ...candidate, action }
                        : candidate,
                    ),
                  )
                }
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function defaultAction(kind: WebsiteAction["kind"]): WebsiteAction {
  switch (kind) {
    case "path":
      return { kind, label: "Meer informatie", path: "/contact" };
    case "external":
      return { kind, label: "Meer informatie", href: "https://example.com" };
    case "phone":
      return { kind, label: "Bel ons", phone: "+31100000000" };
    case "email":
      return { kind, label: "E-mail ons", email: "info@example.com" };
    case "page":
      return { kind, label: "Bekijk pagina", pageId: crypto.randomUUID() };
  }
}

function ActionEditor({
  label,
  action,
  optional = false,
  disabled,
  allowedKinds = ["path", "external", "phone", "email"],
  onChange,
}: {
  label: string;
  action?: WebsiteAction;
  optional?: boolean;
  disabled: boolean;
  allowedKinds?: WebsiteAction["kind"][];
  onChange: (action: WebsiteAction | undefined) => void;
}) {
  if (!action) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(defaultAction(allowedKinds[0] ?? "path"))}
        className="flex min-h-20 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 text-xs font-medium text-slate-500 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {label} toevoegen
      </button>
    );
  }
  const destinationKey =
    action.kind === "path"
      ? "path"
      : action.kind === "external"
        ? "href"
        : action.kind === "phone"
          ? "phone"
          : action.kind === "email"
            ? "email"
            : "pageId";
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        {optional && (
          <button
            type="button"
            aria-label={`${label} verwijderen`}
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        <select
          value={action.kind}
          disabled={disabled}
          onChange={(event) =>
            onChange(defaultAction(event.target.value as WebsiteAction["kind"]))
          }
          className={FLAT_INPUT}
        >
          {allowedKinds.includes("path") && (
            <option value="path">Intern pad</option>
          )}
          {allowedKinds.includes("external") && (
            <option value="external">Externe HTTPS-link</option>
          )}
          {allowedKinds.includes("phone") && (
            <option value="phone">Telefoonnummer</option>
          )}
          {allowedKinds.includes("email") && (
            <option value="email">E-mailadres</option>
          )}
          {action.kind === "page" && <option value="page">Pagina-ID</option>}
        </select>
        <input
          value={action.label}
          disabled={disabled}
          placeholder="Knoptekst"
          onChange={(event) =>
            onChange({ ...action, label: event.target.value })
          }
          className={FLAT_INPUT}
        />
        <input
          value={text((action as unknown as ContentRecord)[destinationKey])}
          disabled={disabled || action.kind === "page"}
          placeholder={destinationKey}
          onChange={(event) =>
            onChange({
              ...action,
              [destinationKey]: event.target.value,
            } as WebsiteAction)
          }
          className={FLAT_INPUT}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-cyan-600"
      />
      {label}
    </label>
  );
}

function FlatField({
  label,
  hint,
  required,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  group?: boolean;
  children: ReactNode;
}) {
  const content = (
    <>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {hint && (
        <span className="block pb-1 text-[11px] text-slate-400">{hint}</span>
      )}
    </>
  );
  if (group) {
    return (
      <div
        role="group"
        aria-label={label}
        className="block border-b border-slate-100 pb-1 focus-within:border-cyan-300"
      >
        {content}
      </div>
    );
  }
  return (
    <label className="block border-b border-slate-100 pb-1 focus-within:border-cyan-300">
      {content}
    </label>
  );
}
