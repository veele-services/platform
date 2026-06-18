"use client";

import { useState, useTransition, useRef } from "react";
import {
  Upload, Download, Trash2, FileText, FileSpreadsheet,
  Image as ImageIcon, File, Paperclip, Plus, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  uploadDocument,
  deleteDocument,
  getDocumentDownloadUrl,
  type DocumentRow,
  type DocumentEntityType,
} from "@/app/actions/documents";

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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  entityType:       DocumentEntityType;
  entityId:         string;
  initialDocuments: DocumentRow[];
  canWrite:         boolean;
}

export function EntityDocumentsPanel({
  entityType,
  entityId,
  initialDocuments,
  canWrite,
}: Props) {
  const [documents, setDocuments]         = useState(initialDocuments);
  const [showUpload, setShowUpload]       = useState(false);
  const [isPending, startTransition]      = useTransition();
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const [uploadName, setUploadName]   = useState("");
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function showFlash(msg: string, isErr: boolean) {
    if (isErr) { setError(msg); setTimeout(() => setError(null), 4000); }
    else        { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); }
  }

  function resetForm() {
    setUploadName("");
    setUploadFile(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile)       { setUploadError("Selecteer een bestand."); return; }
    if (!uploadName.trim()) { setUploadError("Voer een naam in.");      return; }
    setUploadError(null);

    const fd = new FormData();
    fd.append("name",       uploadName.trim());
    fd.append("entityType", entityType);
    fd.append("entityId",   entityId);
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
          entityType,
          entityId,
          entityName:    null,
          uploadedBy:    "",
          uploaderEmail: "",
          uploaderName:  null,
          createdAt:     new Date().toISOString(),
        };
        setDocuments((prev) => [newDoc, ...prev]);
        resetForm();
        setShowUpload(false);
        showFlash("Bijlage toegevoegd.", false);
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
        showFlash("Bijlage verwijderd.", false);
      } else {
        showFlash((result as { message?: string }).message ?? "Verwijderen mislukt.", true);
      }
    });
  }

  return (
    <div className="veele-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="font-heading text-base font-semibold flex items-center gap-2"
          style={{ color: "#081D3A" }}
        >
          <Paperclip className="h-4 w-4" style={{ color: "#00B7B3" }} />
          Bijlagen
          {documents.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 py-0.5 min-w-[20px]"
              style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
            >
              {documents.length}
            </span>
          )}
        </h2>
        {canWrite && (
          <button
            onClick={() => { setShowUpload((v) => !v); if (showUpload) resetForm(); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "#081D3A" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Bijlage toevoegen
          </button>
        )}
      </div>

      {/* Flash messages */}
      {error   && (
        <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </p>
      )}
      {success && (
        <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}>
          <CheckCircle2 className="h-4 w-4" />{success}
        </p>
      )}

      {/* Inline upload form */}
      {showUpload && (
        <form
          onSubmit={handleUploadSubmit}
          className="rounded-lg p-4 space-y-3"
          style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Naam <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="bijv. Contract"
                className="veele-input w-full"
                disabled={isPending}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Bestand <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.svg"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                disabled={isPending}
                className="block w-full text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:px-2.5 file:py-1 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              {uploadFile && (
                <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                  {uploadFile.name} · {formatFileSize(uploadFile.size)}
                </p>
              )}
            </div>
          </div>

          {uploadError && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{uploadError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !uploadFile || !uploadName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#00B7B3" }}
            >
              <Upload className="h-3.5 w-3.5" />
              {isPending ? "Uploaden…" : "Uploaden"}
            </button>
            <button
              type="button"
              onClick={() => { setShowUpload(false); resetForm(); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border"
              style={{ borderColor: "#E2E8F0", color: "#475569" }}
            >
              Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Document list */}
      {documents.length === 0 && !showUpload ? (
        <div className="py-4 text-center" style={{ color: "#94A3B8" }}>
          <p className="text-sm">Geen bijlagen gevonden.</p>
          {canWrite && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "#00B7B3" }}
            >
              <Upload className="h-3 w-3" />
              Bijlage toevoegen
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-2.5">
              {getMimeIcon(doc.mimeType)}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "#081D3A" }}
                  title={doc.name}
                >
                  {doc.name}
                </p>
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={isPending && downloadingId === doc.id}
                  title="Downloaden"
                  className="rounded p-1.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <Download
                    className="h-3.5 w-3.5"
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
                      className="h-3.5 w-3.5"
                      style={{ color: deletingId === doc.id ? "#94A3B8" : "#DC2626" }}
                    />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
