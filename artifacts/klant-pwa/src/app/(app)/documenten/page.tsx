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

const DOCUMENT_TYPE_OPTIONS = [
  { value: "all", label: "Alle typen" },
  { value: "pdf", label: "PDF" },
  { value: "word", label: "Word" },
  { value: "sheet", label: "Excel" },
  { value: "image", label: "Afbeelding" },
  { value: "other", label: "Overig" },
] as const;

type DocumentTypeFilter = (typeof DOCUMENT_TYPE_OPTIONS)[number]["value"];

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
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterDocuments(
  documents: CustomerDocument[],
  query: string,
  type: DocumentTypeFilter,
) {
  return documents.filter((document) => {
    const matchesType = type === "all" || typeFilterForMime(document.mimeType) === type;
    return matchesType && matchesDocumentSearch(document, query);
  });
}

function removeFilterHref({
  query,
  type,
  remove,
}: {
  query: string;
  type: DocumentTypeFilter;
  remove: "query" | "type";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "type" && type !== "all") params.set("type", type);
  const value = params.toString();
  return value ? `/documenten?${value}` : "/documenten";
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
              className="block truncate text-sm font-black"
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
        <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
          {mimeLabel(doc.mimeType)}
        </span>
      ),
    },
    {
      key: "size",
      header: "Grootte",
      render: (doc) => (
        <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
          {formatBytes(doc.sizeBytes)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (doc) => (
        <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
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
          <DocumentDownloadButton documentId={doc.id} filename={doc.filename} />
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function DocumentenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const selectedType = normalizeTypeFilter(params.type);
  const documents = await getMyDocuments();
  const visibleDocuments = filterDocuments(documents, query, selectedType);
  const selectedTypeLabel =
    DOCUMENT_TYPE_OPTIONS.find((option) => option.value === selectedType)?.label ?? "Alle typen";

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: removeFilterHref({ query, type: selectedType, remove: "query" }),
        }
      : null,
    selectedType !== "all"
      ? {
          label: `Type: ${selectedTypeLabel}`,
          href: removeFilterHref({ query, type: selectedType, remove: "type" }),
        }
      : null,
  ].filter((filter): filter is { label: string; href: string } => Boolean(filter));

  return (
    <PortalPageShell
      title="Documenten"
      subtitle="Bestanden die met uw organisatie zijn gedeeld."
      status={{ label: `${documents.length} gedeeld`, tone: documents.length > 0 ? "accent" : "neutral" }}
    >
      <PortalToolbar
        resultLabel={`${visibleDocuments.length} van ${documents.length} documenten`}
        activeFilters={<PortalActiveFilterChips filters={activeFilters} clearHref="/documenten" />}
        actions={
          <PortalFilterSheet
            title="Documentfilters"
            description="Verfijn de lijst op bestandsnaam, type of formaat."
            activeCount={activeFilters.length}
          >
            <DocumentFilterForm query={query} selectedType={selectedType} />
          </PortalFilterSheet>
        }
      >
        <form action="/documenten" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
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
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
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
            <FolderOpen
              size={32}
              style={{ color: "var(--color-muted-fg)" }}
            />
          ),
          title: activeFilters.length > 0 ? "Geen documenten gevonden" : "Geen documenten beschikbaar",
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
                  className="truncate text-sm font-black"
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
                  {mimeLabel(doc.mimeType)} - {formatBytes(doc.sizeBytes)} - {formatDate(doc.createdAt)}
                </p>
              </div>
              <PortalActionMenu label={`Acties voor ${doc.name}`}>
                <DocumentDownloadButton documentId={doc.id} filename={doc.filename} />
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
}: {
  query: string;
  selectedType: DocumentTypeFilter;
}) {
  return (
    <form action="/documenten" className="space-y-4">
      <div>
        <label
          htmlFor="document-filter-query"
          className="text-xs font-black"
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
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Type
        </label>
        <select
          id="document-filter-type"
          name="type"
          defaultValue={selectedType}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
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
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <a
          href="/documenten"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-black"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </a>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
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
