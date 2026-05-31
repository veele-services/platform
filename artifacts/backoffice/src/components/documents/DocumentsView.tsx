"use client";

import { useState, useTransition, useRef } from "react";
import {
  Upload, Download, Trash2, FileText, FileSpreadsheet,
  Image as ImageIcon, File, Plus, X, AlertCircle, CheckCircle2,
  Link2,
} from "lucide-react";
import {
  uploadDocument,
  deleteDocument,
  getDocumentDownloadUrl,
  DOCUMENT_ENTITY_TYPES,
  type DocumentRow,
  type DocumentEntityType,
} from "@/app/actions/documents";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<DocumentEntityType | "all", string> = {
  all:        "Alle",
  assignment: "Opdrachten",
  customer:   "Klanten",
  personnel:  "Personeel",
  object:     "Objecten",
  general:    "Algemeen",
};

const ENTITY_TYPE_SINGULAR: Record<DocumentEntityType, string> = {
  general:    "Algemeen",
  assignment: "Opdracht",
  customer:   "Klant",
  personnel:  "Personeelslid",
  object:     "Object",
};

const ENTITY_HREF: Record<DocumentEntityType, string> = {
  general:    "",
  assignment: "/assignments",
  customer:   "/customers",
  personnel:  "/personnel",
  object:     "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getMimeIcon(mimeType: string) {
  if (mimeType === "application/pdf")
    return <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#DC2626" }} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4 flex-shrink-0" style={{ color: "#16A34A" }} />;
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 flex-shrink-0" style={{ color: "#7C3AED" }} />;
  if (mimeType.includes("word") || mimeType.includes("wordprocessing"))
    return <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#1D4ED8" }} />;
  return <File className="h-4 w-4 flex-shrink-0" style={{ color: "#64748B" }} />;
}

function getMimeBadge(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("wordprocessing") || mimeType.includes("word")) return "Word";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "PPT";
  if (mimeType.startsWith("image/")) return "Afbeelding";
  return "Bestand";
}

function EntityLink({ doc }: { doc: DocumentRow }) {
  if (doc.entityType === "general" || !doc.entityId) {
    return <span style={{ color: "#94A3B8" }}>—</span>;
  }

  const label = doc.entityName ?? doc.entityId.slice(0, 8) + "…";
  const base  = ENTITY_HREF[doc.entityType];

  if (base && doc.entityName) {
    return (
      <a
        href={`${base}/${doc.entityId}`}
        className="inline-flex items-center gap-1 text-xs hover:underline truncate max-w-[180px]"
        style={{ color: "#00B7B3" }}
        title={doc.entityName}
      >
        <Link2 className="h-3 w-3 flex-shrink-0" />
        {label}
      </a>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs truncate max-w-[180px]"
      style={{ color: "#475569" }}
      title={doc.entityId}
    >
      <Link2 className="h-3 w-3 flex-shrink-0" />
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialDocuments: DocumentRow[];
  canWrite:         boolean;
}

export function DocumentsView({ initialDocuments, canWrite }: Props) {
  const [documents, setDocuments]       = useState(initialDocuments);
  const [activeFilter, setActiveFilter] = useState<DocumentEntityType | "all">("all");
  const [showUpload, setShowUpload]     = useState(false);
  const [isPending, startTransition]    = useTransition();
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // Upload form state
  const [uploadName, setUploadName]             = useState("");
  const [uploadEntityType, setUploadEntityType] = useState<DocumentEntityType>("general");
  const [uploadEntityId, setUploadEntityId]     = useState("");
  const [uploadFile, setUploadFile]             = useState<File | null>(null);
  const [uploadError, setUploadError]           = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = activeFilter === "all"
    ? documents
    : documents.filter((d) => d.entityType === activeFilter);

  function showFlash(msg: string, isErr: boolean) {
    if (isErr) { setError(msg); setTimeout(() => setError(null), 4000); }
    else        { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); }
  }

  function resetUploadForm() {
    setUploadName("");
    setUploadEntityType("general");
    setUploadEntityId("");
    setUploadFile(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) { setUploadError("Selecteer een bestand."); return; }
    if (!uploadName.trim()) { setUploadError("Voer een naam in."); return; }
    setUploadError(null);

    const fd = new FormData();
    fd.append("name",       uploadName.trim());
    fd.append("entityType", uploadEntityType);
    fd.append("entityId",   uploadEntityId.trim());
    fd.append("file",       uploadFile);

    startTransition(async () => {
      const result = await uploadDocument(fd);
      if (result.success && result.data) {
        const newDoc: DocumentRow = {
          id:            result.data.id,
          name:          uploadName.trim(),
          filename:      uploadFile.name,
          mimeType:      uploadFile.type,
          sizeBytes:     uploadFile.size,
          entityType:    uploadEntityType,
          entityId:      uploadEntityId.trim() || null,
          entityName:    null,
          uploadedBy:    "",
          uploaderEmail: "",
          uploaderName:  null,
          createdAt:     new Date().toISOString(),
        };
        setDocuments((prev) => [newDoc, ...prev]);
        resetUploadForm();
        setShowUpload(false);
        showFlash("Document geüpload.", false);
      } else {
        setUploadError((result as { message?: string }).message ?? "Uploaden mislukt.");
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
        showFlash((result as { message?: string }).message ?? "Download mislukt.", true);
      }
    });
  }

  function handleDelete(doc: DocumentRow) {
    if (!confirm(`Weet u zeker dat u "${doc.name}" wilt verwijderen?`)) return;
    setDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteDocument(doc.id);
      setDeletingId(null);
      if (result.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        showFlash("Document verwijderd.", false);
      } else {
        showFlash((result as { message?: string }).message ?? "Verwijderen mislukt.", true);
      }
    });
  }

  const filterTabs: Array<DocumentEntityType | "all"> = [
    "all", "assignment", "customer", "personnel", "object", "general",
  ];

  return (
    <div className="space-y-4">

      {/* Flash messages */}
      {(error || success) && (
        <div className="flex items-center gap-2">
          {error   && <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}><AlertCircle className="h-4 w-4" />{error}</span>}
          {success && <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}><CheckCircle2 className="h-4 w-4" />{success}</span>}
        </div>
      )}

      {/* Filter bar + upload button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {filterTabs.map((type) => {
            const count = type === "all"
              ? documents.length
              : documents.filter((d) => d.entityType === type).length;
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  activeFilter === type
                    ? { backgroundColor: "#081D3A", color: "#FFFFFF" }
                    : { backgroundColor: "#F1F5F9", color: "#475569" }
                }
              >
                {ENTITY_TYPE_LABELS[type]}
                <span
                  className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[18px]"
                  style={
                    activeFilter === type
                      ? { backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }
                      : { backgroundColor: "#E2E8F0", color: "#64748B" }
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {canWrite && (
          <button
            onClick={() => { setShowUpload((v) => !v); if (showUpload) resetUploadForm(); }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "#081D3A" }}
          >
            {showUpload ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showUpload ? "Annuleren" : "Document uploaden"}
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={handleUploadSubmit} className="veele-card space-y-4">
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
            Nieuw document uploaden
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Naam <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="bijv. SLA-contract 2025"
                className="veele-input w-full"
                disabled={isPending}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Categorie
              </label>
              <select
                value={uploadEntityType}
                onChange={(e) => {
                  setUploadEntityType(e.target.value as DocumentEntityType);
                  setUploadEntityId("");
                }}
                className="veele-input w-full"
                disabled={isPending}
              >
                {DOCUMENT_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{ENTITY_TYPE_SINGULAR[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {uploadEntityType !== "general" && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Entiteit-ID{" "}
                <span className="font-normal" style={{ color: "#94A3B8" }}>
                  (optioneel — UUID van de gekoppelde {ENTITY_TYPE_SINGULAR[uploadEntityType].toLowerCase()})
                </span>
              </label>
              <input
                type="text"
                value={uploadEntityId}
                onChange={(e) => setUploadEntityId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="veele-input w-full font-mono text-xs"
                disabled={isPending}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Bestand <span style={{ color: "#DC2626" }}>*</span>
              <span className="ml-1 font-normal" style={{ color: "#94A3B8" }}>
                (PDF, Word, Excel, afbeelding — max. 20 MB)
              </span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.svg"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              disabled={isPending}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
            />
            {uploadFile && (
              <p className="text-xs mt-1" style={{ color: "#64748B" }}>
                {uploadFile.name} · {formatFileSize(uploadFile.size)}
              </p>
            )}
          </div>

          {uploadError && (
            <p className="text-sm" style={{ color: "#DC2626" }}>{uploadError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !uploadFile || !uploadName.trim()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#00B7B3" }}
            >
              <Upload className="h-4 w-4" />
              {isPending ? "Uploaden…" : "Uploaden"}
            </button>
            <button
              type="button"
              onClick={() => { setShowUpload(false); resetUploadForm(); }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium border"
              style={{ borderColor: "#E2E8F0", color: "#475569" }}
            >
              Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Document table */}
      <div className="veele-card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3" style={{ color: "#94A3B8" }}>
            <File className="h-10 w-10" strokeWidth={1.5} />
            <p className="text-sm">
              {activeFilter === "all"
                ? "Nog geen documenten opgeslagen."
                : `Geen documenten in categorie "${ENTITY_TYPE_LABELS[activeFilter]}".`}
            </p>
            {canWrite && !showUpload && (
              <button
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "#00B7B3" }}
              >
                <Upload className="h-3.5 w-3.5" />
                Document uploaden
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  {["Naam", "Type", "Categorie", "Koppeling", "Geüpload door", "Grootte", "Datum", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: "#94A3B8" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-50"
                    style={{ borderBottom: "1px solid #F8FAFC" }}
                  >
                    {/* Naam + bestandsnaam */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {getMimeIcon(doc.mimeType)}
                        <span
                          className="font-medium truncate max-w-[160px]"
                          style={{ color: "#081D3A" }}
                          title={doc.name}
                        >
                          {doc.name}
                        </span>
                      </div>
                      <p
                        className="text-xs mt-0.5 ml-6 truncate max-w-[160px]"
                        style={{ color: "#94A3B8" }}
                        title={doc.filename}
                      >
                        {doc.filename}
                      </p>
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                      >
                        {getMimeBadge(doc.mimeType)}
                      </span>
                    </td>

                    {/* Categorie */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}
                      >
                        {ENTITY_TYPE_SINGULAR[doc.entityType]}
                      </span>
                    </td>

                    {/* Koppeling */}
                    <td className="px-4 py-3">
                      <EntityLink doc={doc} />
                    </td>

                    {/* Uploader */}
                    <td className="px-4 py-3">
                      <div className="text-xs max-w-[140px]">
                        {doc.uploaderName ? (
                          <>
                            <p className="font-medium truncate" style={{ color: "#374151" }} title={doc.uploaderName}>
                              {doc.uploaderName}
                            </p>
                            <p className="truncate" style={{ color: "#94A3B8" }} title={doc.uploaderEmail}>
                              {doc.uploaderEmail}
                            </p>
                          </>
                        ) : (
                          <p className="truncate" style={{ color: "#475569" }} title={doc.uploaderEmail}>
                            {doc.uploaderEmail}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Grootte */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#64748B" }}>
                      {formatFileSize(doc.sizeBytes)}
                    </td>

                    {/* Datum */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#64748B" }}>
                      {formatDate(doc.createdAt)}
                    </td>

                    {/* Acties */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={isPending && downloadingId === doc.id}
                          title="Downloaden"
                          className="rounded p-1.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          <Download
                            className="h-4 w-4"
                            style={{ color: downloadingId === doc.id ? "#94A3B8" : "#00B7B3" }}
                          />
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={isPending && deletingId === doc.id}
                            title="Verwijderen"
                            className="rounded p-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2
                              className="h-4 w-4"
                              style={{ color: deletingId === doc.id ? "#94A3B8" : "#DC2626" }}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs" style={{ color: "#94A3B8" }}>
          {filtered.length} document{filtered.length !== 1 ? "en" : ""}
          {activeFilter !== "all" && ` in categorie "${ENTITY_TYPE_LABELS[activeFilter]}"`}
        </p>
      )}
    </div>
  );
}
