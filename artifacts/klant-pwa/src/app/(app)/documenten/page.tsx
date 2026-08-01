import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import { FileText, FolderOpen } from "lucide-react";
import { getMyDocuments } from "@/actions/documents";
import type { CustomerDocument } from "@/actions/documents";
import { DocumentDownloadButton } from "@/components/DocumentDownloadButton";
import { PortalActionMenu } from "@/components/PortalActionMenu";
import { PortalFilterSheet } from "@/components/PortalFilterSheet";
import {
  PortalActiveFilterChips,
  PortalDataList,
  PortalPageShell,
  PortalToolbar,
  PortalToolbarSearch,
  PortalToolbarSelect,
  type PortalDataColumn,
} from "@/components/portal-ui";
import { requireCustomerPortalFeature } from "@/lib/portal-features";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "all", label: "Alle typen" },
  { value: "pdf", label: "PDF" },
  { value: "word", label: "Word" },
  { value: "sheet", label: "Excel" },
  { value: "image", label: "Afbeelding" },
  { value: "other", label: "Overig" },
] as const;

const DATE_FILTER_OPTIONS = [
  { value: "all", label: "Alle datums" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "year", label: "Dit jaar" },
] as const;

type DocumentTypeFilter = (typeof DOCUMENT_TYPE_OPTIONS)[number]["value"];
type DocumentDateFilter = (typeof DATE_FILTER_OPTIONS)[number]["value"];

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word")) return "Word";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("image")) return "Afbeelding";
  return "Bestand";
}

function entityLabel(doc: CustomerDocument): string {
  if (doc.entityType === "assignment")
    return doc.assignmentCode ? `Opdracht ${doc.assignmentCode}` : "Opdracht";
  if (doc.entityType === "object")
    return doc.objectName ? `Object ${doc.objectName}` : "Object";
  return "Organisatie";
}

function typeFilterForMime(mimeType: string): DocumentTypeFilter {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("word")) return "word";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "sheet";
  if (mimeType.includes("image")) return "image";
  return "other";
}

function normalizeTypeFilter(value?: string): DocumentTypeFilter {
  return DOCUMENT_TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as DocumentTypeFilter)
    : "all";
}

function normalizeDateFilter(value?: string): DocumentDateFilter {
  return DATE_FILTER_OPTIONS.some((option) => option.value === value)
    ? (value as DocumentDateFilter)
    : "all";
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function matchesDocumentSearch(document: CustomerDocument, query: string) {
  if (!query) return true;
  const haystack = [
    document.name,
    document.filename,
    document.mimeType,
    mimeLabel(document.mimeType),
    document.entityLabel,
    document.objectName,
    document.assignmentCode,
    document.assignmentTitle,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesDateFilter(createdAt: string, date: DocumentDateFilter) {
  if (date === "all") return true;
  const created = new Date(createdAt);
  const now = new Date();
  if (date === "year") return created.getFullYear() === now.getFullYear();
  const days = date === "30d" ? 30 : 90;
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return created >= threshold;
}

function filterDocuments({
  documents,
  query,
  type,
  objectId,
  assignmentId,
  date,
}: {
  documents: CustomerDocument[];
  query: string;
  type: DocumentTypeFilter;
  objectId: string;
  assignmentId: string;
  date: DocumentDateFilter;
}) {
  return documents.filter((document) => {
    const matchesType =
      type === "all" || typeFilterForMime(document.mimeType) === type;
    const matchesObject = objectId === "all" || document.objectId === objectId;
    const matchesAssignment =
      assignmentId === "all" || document.assignmentId === assignmentId;
    return (
      matchesType &&
      matchesObject &&
      matchesAssignment &&
      matchesDateFilter(document.createdAt, date) &&
      matchesDocumentSearch(document, query)
    );
  });
}

function removeFilterHref({
  query,
  type,
  objectId,
  assignmentId,
  date,
  remove,
}: {
  query: string;
  type: DocumentTypeFilter;
  objectId: string;
  assignmentId: string;
  date: DocumentDateFilter;
  remove: "query" | "type" | "object" | "assignment" | "date";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "type" && type !== "all") params.set("type", type);
  if (remove !== "object" && objectId !== "all") params.set("object", objectId);
  if (remove !== "assignment" && assignmentId !== "all")
    params.set("assignment", assignmentId);
  if (remove !== "date" && date !== "all") params.set("date", date);
  const value = params.toString();
  return value ? `/documenten?${value}` : "/documenten";
}

function uniqueOptions(
  items: Array<{ id: string | null; label: string | null }>,
) {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.id && item.label && !map.has(item.id))
      map.set(item.id, item.label);
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

function documentColumns(): Array<PortalDataColumn<CustomerDocument>> {
  return [
    {
      key: "document",
      header: "Document",
      render: (doc) => (
        <span className="flex min-w-[18rem] items-center gap-3">
          <DocumentIcon />
          <span className="min-w-0">
            <span
              className="block truncate text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {doc.name}
            </span>
            <span
              className="mt-0.5 block truncate text-xs font-semibold"
              style={{ color: "var(--color-muted-fg)" }}
            >
              {doc.filename}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (doc) => (
        <span
          className="font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {mimeLabel(doc.mimeType)}
        </span>
      ),
    },
    {
      key: "context",
      header: "Koppeling",
      render: (doc) => (
        <span className="block min-w-[12rem]">
          <span
            className="block text-sm font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {entityLabel(doc)}
          </span>
          {doc.assignmentTitle || doc.objectName ? (
            <span
              className="mt-0.5 block truncate text-xs font-semibold"
              style={{ color: "var(--color-muted-fg)" }}
            >
              {doc.assignmentTitle ?? doc.objectName}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "size",
      header: "Grootte",
      render: (doc) => (
        <span
          className="font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatBytes(doc.sizeBytes)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (doc) => (
        <span
          className="font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatDate(doc.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actie",
      align: "right",
      render: (doc) => (
        <PortalActionMenu label={`Acties voor ${doc.name}`}>
          <DocumentDownloadButton
            documentId={doc.id}
            filename={doc.filename}
            renderAsMenuItem
          />
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function DocumentenPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    object?: string;
    assignment?: string;
    date?: string;
  }>;
}) {
  await requireCustomerPortalFeature("documents");
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const selectedType = normalizeTypeFilter(params.type);
  const selectedObject = params.object?.trim() || "all";
  const selectedAssignment = params.assignment?.trim() || "all";
  const selectedDate = normalizeDateFilter(params.date);
  const documents = await getMyDocuments();
  const visibleDocuments = filterDocuments({
    documents,
    query,
    type: selectedType,
    objectId: selectedObject,
    assignmentId: selectedAssignment,
    date: selectedDate,
  });
  const objectOptions = uniqueOptions(
    documents.map((document) => ({
      id: document.objectId,
      label: document.objectName,
    })),
  );
  const assignmentOptions = uniqueOptions(
    documents.map((document) => ({
      id: document.assignmentId,
      label: document.assignmentCode
        ? `${document.assignmentCode} - ${document.assignmentTitle ?? "Opdracht"}`
        : document.assignmentTitle,
    })),
  );
  const selectedTypeLabel =
    DOCUMENT_TYPE_OPTIONS.find((option) => option.value === selectedType)
      ?.label ?? "Alle typen";
  const selectedObjectLabel =
    objectOptions.find((option) => option.id === selectedObject)?.label ??
    "Object";
  const selectedAssignmentLabel =
    assignmentOptions.find((option) => option.id === selectedAssignment)
      ?.label ?? "Opdracht";
  const selectedDateLabel =
    DATE_FILTER_OPTIONS.find((option) => option.value === selectedDate)
      ?.label ?? "Alle datums";

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: removeFilterHref({
            query,
            type: selectedType,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "query",
          }),
        }
      : null,
    selectedType !== "all"
      ? {
          label: `Type: ${selectedTypeLabel}`,
          href: removeFilterHref({
            query,
            type: selectedType,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "type",
          }),
        }
      : null,
    selectedObject !== "all"
      ? {
          label: `Object: ${selectedObjectLabel}`,
          href: removeFilterHref({
            query,
            type: selectedType,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "object",
          }),
        }
      : null,
    selectedAssignment !== "all"
      ? {
          label: `Opdracht: ${selectedAssignmentLabel}`,
          href: removeFilterHref({
            query,
            type: selectedType,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "assignment",
          }),
        }
      : null,
    selectedDate !== "all"
      ? {
          label: `Datum: ${selectedDateLabel}`,
          href: removeFilterHref({
            query,
            type: selectedType,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "date",
          }),
        }
      : null,
  ].filter((filter): filter is { label: string; href: string } =>
    Boolean(filter),
  );

  return (
    <PortalPageShell
      title="Documenten"
      subtitle="Bestanden die met uw organisatie zijn gedeeld."
      status={{
        label: `${documents.length} gedeeld`,
        tone: documents.length > 0 ? "accent" : "neutral",
      }}
    >
      <PortalToolbar
        resultLabel={`${visibleDocuments.length} van ${documents.length} documenten`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref="/documenten"
          />
        }
        actions={
          <PortalFilterSheet
            title="Documentfilters"
            description="Verfijn de lijst op object, opdracht, type, datum of bestandsnaam."
            activeCount={activeFilters.length}
          >
            <DocumentFilterForm
              query={query}
              selectedType={selectedType}
              selectedObject={selectedObject}
              selectedAssignment={selectedAssignment}
              selectedDate={selectedDate}
              objectOptions={objectOptions}
              assignmentOptions={assignmentOptions}
            />
          </PortalFilterSheet>
        }
      >
        <form
          action="/documenten"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek document of bestandsnaam"
          />
          <PortalToolbarSelect
            name="type"
            label="Documenttype"
            defaultValue={selectedType}
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </PortalToolbarSelect>
          {selectedObject !== "all" ? (
            <input type="hidden" name="object" value={selectedObject} />
          ) : null}
          {selectedAssignment !== "all" ? (
            <input type="hidden" name="assignment" value={selectedAssignment} />
          ) : null}
          {selectedDate !== "all" ? (
            <input type="hidden" name="date" value={selectedDate} />
          ) : null}
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent-accessible)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      <PortalDataList
        items={visibleDocuments}
        columns={documentColumns()}
        getItemKey={(doc) => doc.id}
        tableLabel="Gedeelde documenten"
        emptyState={{
          icon: (
            <FolderOpen size={32} style={{ color: "var(--color-muted-fg)" }} />
          ),
          title:
            activeFilters.length > 0
              ? "Geen documenten gevonden"
              : "Geen documenten beschikbaar",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de lijst opnieuw te bekijken."
              : "Documenten verschijnen hier zodra ze met uw organisatie zijn gedeeld.",
        }}
        renderMobileCard={(doc) => (
          <article
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <DocumentIcon />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {doc.name}
                </p>
                <p
                  className="mt-0.5 truncate text-xs font-semibold"
                  style={{ color: "var(--color-muted-fg)" }}
                >
                  {doc.filename}
                </p>
                <p
                  className="mt-2 text-xs font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {mimeLabel(doc.mimeType)} - {formatBytes(doc.sizeBytes)} -{" "}
                  {formatDate(doc.createdAt)}
                </p>
                <p
                  className="mt-1 text-xs font-bold"
                  style={{ color: "var(--color-muted-fg)" }}
                >
                  {entityLabel(doc)}
                  {doc.assignmentTitle || doc.objectName
                    ? ` - ${doc.assignmentTitle ?? doc.objectName}`
                    : ""}
                </p>
              </div>
              <PortalActionMenu label={`Acties voor ${doc.name}`}>
                <DocumentDownloadButton
                  documentId={doc.id}
                  filename={doc.filename}
                  renderAsMenuItem
                />
              </PortalActionMenu>
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function DocumentFilterForm({
  query,
  selectedType,
  selectedObject,
  selectedAssignment,
  selectedDate,
  objectOptions,
  assignmentOptions,
}: {
  query: string;
  selectedType: DocumentTypeFilter;
  selectedObject: string;
  selectedAssignment: string;
  selectedDate: DocumentDateFilter;
  objectOptions: Array<{ id: string; label: string }>;
  assignmentOptions: Array<{ id: string; label: string }>;
}) {
  return (
    <form action="/documenten" className="space-y-4">
      <div>
        <label
          htmlFor="document-filter-query"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="document-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Document of bestandsnaam"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="document-filter-type"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Type
        </label>
        <SelectAdapter
          id="document-filter-type"
          name="type"
          defaultValue={selectedType}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          {DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="document-filter-object"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Object
        </label>
        <SelectAdapter
          id="document-filter-object"
          name="object"
          defaultValue={selectedObject}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle objecten</option>
          {objectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="document-filter-assignment"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Opdracht
        </label>
        <SelectAdapter
          id="document-filter-assignment"
          name="assignment"
          defaultValue={selectedAssignment}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle opdrachten</option>
          {assignmentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="document-filter-date"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Datum
        </label>
        <SelectAdapter
          id="document-filter-date"
          name="date"
          defaultValue={selectedDate}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          {DATE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <a
          href="/documenten"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-semibold"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </a>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent-accessible)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function DocumentIcon() {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
    >
      <FileText size={18} style={{ color: "var(--color-primary)" }} />
    </span>
  );
}
