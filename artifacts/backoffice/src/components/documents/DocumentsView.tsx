"use client";

import { SelectAdapter } from "@/components/ui/select-adapter";
import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";

import {
  deleteDocument,
  getDocumentDownloadUrl,
  uploadDocument,
  type DocumentEntityType,
  type DocumentRow,
} from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantDataTable,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
  type TenantDataTableColumn,
} from "@/components/tenant-ui";
import { DOCUMENT_ENTITY_TYPES } from "@/types/documents";
import { DocumentUploadSheet } from "./DocumentUploadSheet";

const ENTITY_TYPE_LABELS: Record<DocumentEntityType | "all", string> = {
  all: "Alle",
  assignment: "Opdrachten",
  customer: "Klanten",
  personnel: "Personeel",
  object: "Objecten",
  material: "Materialen",
  inventory_item: "Inventaris",
  inventory_issue: "Storingen",
  inventory_maintenance: "Onderhoud",
  general: "Algemeen",
};

const ENTITY_TYPE_SINGULAR: Record<DocumentEntityType, string> = {
  general: "Algemeen",
  assignment: "Opdracht",
  customer: "Klant",
  personnel: "Personeelslid",
  object: "Object",
  material: "Materiaal",
  inventory_item: "Inventarisitem",
  inventory_issue: "Inventarisstoring",
  inventory_maintenance: "Onderhoud/keuring",
};

const ENTITY_HREF: Record<DocumentEntityType, string> = {
  general: "",
  assignment: "/assignments",
  customer: "/customers",
  personnel: "/personnel",
  object: "/objects",
  material: "/materials",
  inventory_item: "/inventory",
  inventory_issue: "/inventory/issues",
  inventory_maintenance: "",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMimeIcon(mimeType: string) {
  if (mimeType === "application/pdf")
    return <FileText className="h-4 w-4 flex-shrink-0 text-red-600" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-green-600" />;
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 flex-shrink-0 text-violet-600" />;
  if (mimeType.includes("word") || mimeType.includes("wordprocessing"))
    return <FileText className="h-4 w-4 flex-shrink-0 text-blue-700" />;
  return <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
}

function getMimeBadge(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "Excel";
  if (mimeType.includes("wordprocessing") || mimeType.includes("word"))
    return "Word";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "PPT";
  if (mimeType.startsWith("image/")) return "Afbeelding";
  return "Bestand";
}

function EntityLink({ doc }: { doc: DocumentRow }) {
  if (doc.entityType === "general" || !doc.entityId) {
    return <span className="text-muted-foreground">-</span>;
  }

  const label = doc.entityName ?? `${doc.entityId.slice(0, 8)}...`;
  const base = ENTITY_HREF[doc.entityType];

  if (base && doc.entityName) {
    return (
      <a
        href={`${base}/${doc.entityId}`}
        className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs text-primary hover:underline"
        title={doc.entityName}
      >
        <Link2 className="h-3 w-3 flex-shrink-0" />
        {label}
      </a>
    );
  }

  return (
    <span
      className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs text-slate-600"
      title={doc.entityId}
    >
      <Link2 className="h-3 w-3 flex-shrink-0" />
      {label}
    </span>
  );
}

interface Props {
  initialDocuments: DocumentRow[];
  canWrite: boolean;
  canDelete: boolean;
  contextMutationCapabilities: Partial<Record<DocumentEntityType, boolean>>;
}

export function DocumentsView({
  initialDocuments,
  canWrite,
  canDelete,
  contextMutationCapabilities,
}: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [activeFilter, setActiveFilter] = useState<DocumentEntityType | "all">(
    "all",
  );
  const [searchInput, setSearchInput] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);

  const canMutateContext = (entityType: DocumentEntityType) =>
    contextMutationCapabilities[entityType] !== false;
  const uploadEntityTypes = DOCUMENT_ENTITY_TYPES.filter(canMutateContext);

  const [uploadName, setUploadName] = useState("");
  const [uploadEntityType, setUploadEntityType] =
    useState<DocumentEntityType>("general");
  const [uploadEntityId, setUploadEntityId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalizedSearch = searchInput.trim().toLowerCase();
  const filtered = documents.filter((document) => {
    const matchesType =
      activeFilter === "all" || document.entityType === activeFilter;
    const matchesSearch =
      !normalizedSearch ||
      [
        document.name,
        document.filename,
        document.entityName,
        document.uploaderName,
        document.uploaderEmail,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        );

    return matchesType && matchesSearch;
  });

  const activeFilters = [
    searchInput
      ? {
          id: "search",
          label: "Zoeken",
          value: searchInput,
          onRemove: () => setSearchInput(""),
        }
      : null,
    activeFilter !== "all"
      ? {
          id: "entityType",
          label: "Categorie",
          value: ENTITY_TYPE_LABELS[activeFilter],
          onRemove: () => setActiveFilter("all"),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function showFlash(message: string, isError: boolean) {
    if (isError) {
      setError(message);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 4000);
    }
  }

  function resetUploadForm() {
    setUploadName("");
    setUploadEntityType("general");
    setUploadEntityId("");
    setUploadFile(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUploadOpenChange(open: boolean) {
    setShowUpload(open);
    if (!open) resetUploadForm();
  }

  function handleUploadSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadFile) {
      setUploadError("Selecteer een bestand.");
      return;
    }
    if (!uploadName.trim()) {
      setUploadError("Voer een naam in.");
      return;
    }
    setUploadError(null);

    const formData = new FormData();
    formData.append("name", uploadName.trim());
    formData.append("entityType", uploadEntityType);
    formData.append("entityId", uploadEntityId.trim());
    formData.append("file", uploadFile);

    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (result.success && result.data) {
        const newDoc: DocumentRow = {
          id: result.data.id,
          name: uploadName.trim(),
          filename: uploadFile.name,
          mimeType: uploadFile.type,
          sizeBytes: uploadFile.size,
          entityType: uploadEntityType,
          entityId: uploadEntityId.trim() || null,
          entityName: null,
          uploadedBy: "",
          uploaderEmail: "",
          uploaderName: null,
          createdAt: new Date().toISOString(),
        };
        setDocuments((current) => [newDoc, ...current]);
        resetUploadForm();
        setShowUpload(false);
        showFlash("Document geupload.", false);
      } else {
        setUploadError(
          (result as { message?: string }).message ?? "Uploaden mislukt.",
        );
      }
    });
  }

  function handleDownload(doc: DocumentRow) {
    setDownloadingId(doc.id);
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(doc.id);
      setDownloadingId(null);
      if (result.success && result.data) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      } else {
        showFlash(
          (result as { message?: string }).message ?? "Download mislukt.",
          true,
        );
      }
    });
  }

  function handleDelete(doc: DocumentRow) {
    setDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteDocument(doc.id);
      setDeletingId(null);
      if (result.success) {
        setDocuments((current) =>
          current.filter((document) => document.id !== doc.id),
        );
        showFlash("Document verwijderd.", false);
      } else {
        showFlash(
          (result as { message?: string }).message ?? "Verwijderen mislukt.",
          true,
        );
      }
      setDeleteTarget(null);
    });
  }

  const columns: TenantDataTableColumn<DocumentRow>[] = [
    {
      id: "name",
      header: "Naam",
      cell: (doc) => (
        <div className="flex min-w-0 items-center gap-2">
          {getMimeIcon(doc.mimeType)}
          <div className="min-w-0">
            <p
              className="max-w-[180px] truncate font-medium text-foreground"
              title={doc.name}
            >
              {doc.name}
            </p>
            <p
              className="max-w-[180px] truncate text-xs text-muted-foreground"
              title={doc.filename}
            >
              {doc.filename}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (doc) => (
        <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-slate-600">
          {getMimeBadge(doc.mimeType)}
        </span>
      ),
    },
    {
      id: "category",
      header: "Categorie",
      cell: (doc) => (
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          {ENTITY_TYPE_SINGULAR[doc.entityType]}
        </span>
      ),
    },
    {
      id: "entity",
      header: "Koppeling",
      cell: (doc) => <EntityLink doc={doc} />,
    },
    {
      id: "uploader",
      header: "Geupload door",
      cell: (doc) => (
        <div className="max-w-[160px] text-xs">
          {doc.uploaderName ? (
            <>
              <p
                className="truncate font-medium text-slate-700"
                title={doc.uploaderName}
              >
                {doc.uploaderName}
              </p>
              <p
                className="truncate text-muted-foreground"
                title={doc.uploaderEmail}
              >
                {doc.uploaderEmail}
              </p>
            </>
          ) : (
            <p className="truncate text-slate-600" title={doc.uploaderEmail}>
              {doc.uploaderEmail}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "size",
      header: "Grootte",
      cell: (doc) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatFileSize(doc.sizeBytes)}
        </span>
      ),
    },
    {
      id: "date",
      header: "Datum",
      cell: (doc) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(doc.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (doc) => (
        <TenantActionMenu
          actions={[
            {
              id: "download",
              label: downloadingId === doc.id ? "Downloaden..." : "Downloaden",
              icon: <Download className="h-4 w-4" />,
              disabled: isPending && downloadingId === doc.id,
              onSelect: () => handleDownload(doc),
            },
            ...(canDelete && canMutateContext(doc.entityType)
              ? [
                  {
                    id: "delete",
                    label:
                      deletingId === doc.id ? "Verwijderen..." : "Verwijderen",
                    icon: <Trash2 className="h-4 w-4" />,
                    disabled: isPending && deletingId === doc.id,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => setDeleteTarget(doc),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {(error || success) && (
        <div className="flex items-center gap-2">
          {error && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
          )}
          {success && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </span>
          )}
        </div>
      )}

      <TenantToolbar
        search={
          <TenantToolbarSearch
            value={searchInput}
            placeholder="Zoek document..."
            onChange={(event) => setSearchInput(event.target.value)}
          />
        }
        actions={
          <>
            <TenantFilterDrawer
              activeCount={activeFilters.length}
              title="Documentfilters"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Categorie</span>
                <SelectAdapter
                  value={activeFilter}
                  onChange={(event) =>
                    setActiveFilter(
                      event.target.value as DocumentEntityType | "all",
                    )
                  }
                  className="veele-input"
                >
                  <option value="all">Alle categorieen</option>
                  {DOCUMENT_ENTITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ENTITY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </SelectAdapter>
              </label>
            </TenantFilterDrawer>
            {canWrite && (
              <Button type="button" onClick={() => setShowUpload(true)}>
                <Plus className="h-4 w-4" />
                Document uploaden
              </Button>
            )}
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      <DocumentUploadSheet
        open={showUpload}
        onOpenChange={handleUploadOpenChange}
        title="Nieuw document uploaden"
        name={uploadName}
        onNameChange={setUploadName}
        namePlaceholder="bijv. Keuringsbewijs schrobmachine"
        file={uploadFile}
        fileInputRef={fileRef}
        onFileChange={setUploadFile}
        error={uploadError}
        pending={isPending}
        submitLabel="Uploaden"
        onSubmit={handleUploadSubmit}
      >
        <label className="block text-sm font-medium text-foreground">
          Categorie
          <SelectAdapter
            value={uploadEntityType}
            onChange={(event) => {
              setUploadEntityType(event.target.value as DocumentEntityType);
              setUploadEntityId("");
            }}
            className="veele-input mt-1 w-full"
            disabled={isPending}
          >
            {uploadEntityTypes.map((type) => (
              <option key={type} value={type}>
                {ENTITY_TYPE_SINGULAR[type]}
              </option>
            ))}
          </SelectAdapter>
        </label>

        {uploadEntityType !== "general" && (
          <label className="block text-sm font-medium text-foreground">
            Entiteit-ID
            <span className="block text-xs font-normal text-muted-foreground">
              UUID van de gekoppelde{" "}
              {ENTITY_TYPE_SINGULAR[uploadEntityType].toLowerCase()}
            </span>
            <input
              type="text"
              value={uploadEntityId}
              onChange={(event) => setUploadEntityId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="veele-input mt-1 w-full font-mono text-xs"
              disabled={isPending}
            />
          </label>
        )}
      </DocumentUploadSheet>

      <TenantDataTable
        rows={filtered}
        columns={columns}
        getRowKey={(doc) => doc.id}
        emptyTitle={
          activeFilter === "all"
            ? "Nog geen documenten opgeslagen"
            : `Geen documenten in categorie ${ENTITY_TYPE_LABELS[activeFilter]}`
        }
        emptyDescription="Pas de filters aan of upload een nieuw document."
        renderMobileCard={(doc) => (
          <article className="rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {getMimeIcon(doc.mimeType)}
                  <p className="truncate font-medium text-foreground">
                    {doc.name}
                  </p>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {doc.filename}
                </p>
              </div>
              {columns[7]?.cell(doc, 0)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">
                {getMimeBadge(doc.mimeType)}
              </span>
              <span>{ENTITY_TYPE_SINGULAR[doc.entityType]}</span>
              <span>{formatFileSize(doc.sizeBytes)}</span>
              <span>{formatDate(doc.createdAt)}</span>
            </div>
            {doc.entityType !== "general" && (
              <div className="mt-2">
                <EntityLink doc={doc} />
              </div>
            )}
          </article>
        )}
      />

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} document{filtered.length !== 1 ? "en" : ""}
          {activeFilter !== "all" &&
            ` in categorie "${ENTITY_TYPE_LABELS[activeFilter]}"`}
        </p>
      )}

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Document verwijderen?"
        description={
          deleteTarget
            ? `Weet u zeker dat u "${deleteTarget.name}" wilt verwijderen?`
            : undefined
        }
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </div>
  );
}
