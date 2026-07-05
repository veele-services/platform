"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import {
  deleteDocument,
  getDocumentDownloadUrl,
  uploadDocument,
  type DocumentEntityType,
  type DocumentRow,
} from "@/app/actions/documents";
import { TenantConfirmDialog } from "@/components/tenant-ui";
import { DocumentUploadSheet } from "./DocumentUploadSheet";

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
  if (mimeType === "application/pdf") {
    return <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#DC2626" }} />;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return <FileSpreadsheet className="h-4 w-4 flex-shrink-0" style={{ color: "#16A34A" }} />;
  }
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 flex-shrink-0" style={{ color: "#7C3AED" }} />;
  }
  if (mimeType.includes("word") || mimeType.includes("wordprocessing")) {
    return <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#1D4ED8" }} />;
  }
  return <File className="h-4 w-4 flex-shrink-0" style={{ color: "#64748B" }} />;
}

interface Props {
  entityType: DocumentEntityType;
  entityId: string;
  initialDocuments: DocumentRow[];
  canWrite: boolean;
}

export function EntityDocumentsPanel({
  entityType,
  entityId,
  initialDocuments,
  canWrite,
}: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function showFlash(msg: string, isErr: boolean) {
    if (isErr) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
      return;
    }
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  }

  function resetForm() {
    setUploadName("");
    setUploadFile(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUploadOpenChange(open: boolean) {
    setShowUpload(open);
    if (!open) resetForm();
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Selecteer een bestand.");
      return;
    }
    if (!uploadName.trim()) {
      setUploadError("Voer een naam in.");
      return;
    }
    setUploadError(null);

    const fd = new FormData();
    fd.append("name", uploadName.trim());
    fd.append("entityType", entityType);
    fd.append("entityId", entityId);
    fd.append("file", uploadFile);

    startTransition(async () => {
      const result = await uploadDocument(fd);
      if (result.success && result.data) {
        const newDoc: DocumentRow = {
          id: result.data.id,
          name: uploadName.trim(),
          filename: uploadFile.name,
          mimeType: uploadFile.type,
          sizeBytes: uploadFile.size,
          entityType,
          entityId,
          entityName: null,
          uploadedBy: "",
          uploaderEmail: "",
          uploaderName: null,
          createdAt: new Date().toISOString(),
        };
        setDocuments((prev) => [newDoc, ...prev]);
        resetForm();
        setShowUpload(false);
        showFlash("Bijlage toegevoegd.", false);
        return;
      }
      setUploadError((result as { message?: string }).message ?? "Uploaden mislukt.");
    });
  }

  function handleDownload(doc: DocumentRow) {
    setDownloadingId(doc.id);
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(doc.id);
      setDownloadingId(null);
      if (result.success && result.data) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
        return;
      }
      showFlash((result as { message?: string }).message ?? "Download mislukt.", true);
    });
  }

  function handleDelete(doc: DocumentRow) {
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
      setDeleteTarget(null);
    });
  }

  return (
    <div className="veele-card space-y-4">
      <div className="flex items-center justify-between">
        <h2
          className="font-heading flex items-center gap-2 text-base font-semibold"
          style={{ color: "#081D3A" }}
        >
          <Paperclip className="h-4 w-4" style={{ color: "#00B7B3" }} />
          Bijlagen
          {documents.length > 0 && (
            <span
              className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
            >
              {documents.length}
            </span>
          )}
        </h2>
        {canWrite && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "#081D3A" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Bijlage toevoegen
          </button>
        )}
      </div>

      {error && (
        <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {success && (
        <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}>
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </p>
      )}

      <DocumentUploadSheet
        open={showUpload}
        onOpenChange={handleUploadOpenChange}
        title="Bijlage toevoegen"
        name={uploadName}
        onNameChange={setUploadName}
        namePlaceholder="bijv. Contract"
        file={uploadFile}
        fileInputRef={fileRef}
        onFileChange={setUploadFile}
        error={uploadError}
        pending={isPending}
        submitLabel="Uploaden"
        onSubmit={handleUploadSubmit}
      />

      {documents.length === 0 ? (
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "#081D3A" }} title={doc.name}>
                  {doc.name}
                </p>
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  {formatFileSize(doc.sizeBytes)} - {formatDate(doc.createdAt)}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={isPending && downloadingId === doc.id}
                  title="Downloaden"
                  className="rounded p-1.5 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  <Download
                    className="h-3.5 w-3.5"
                    style={{ color: downloadingId === doc.id ? "#94A3B8" : "#00B7B3" }}
                  />
                </button>
                {canWrite && (
                  <button
                    onClick={() => setDeleteTarget(doc)}
                    disabled={isPending && deletingId === doc.id}
                    title="Verwijderen"
                    className="rounded p-1.5 transition-colors hover:bg-red-50 disabled:opacity-50"
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

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Bijlage verwijderen?"
        description={deleteTarget ? `Weet u zeker dat u "${deleteTarget.name}" wilt verwijderen?` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </div>
  );
}
