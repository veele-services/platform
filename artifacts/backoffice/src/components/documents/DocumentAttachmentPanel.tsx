"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileText,
  Image as ImageIcon,
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
import { Button } from "@/components/ui/button";
import { TenantConfirmDialog } from "@/components/tenant-ui";
import { DocumentUploadSheet } from "./DocumentUploadSheet";

interface DocumentAttachmentPanelProps {
  entityType: DocumentEntityType;
  entityId: string;
  initialDocuments: DocumentRow[];
  canWrite: boolean;
  canDelete: boolean;
  title: string;
  uploadLabel?: string;
  emptyMessage?: string;
  namePlaceholder?: string;
}

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

function getDocumentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4" style={{ color: "#7C3AED" }} />;
  }
  if (mimeType === "application/pdf") {
    return <FileText className="h-4 w-4" style={{ color: "#DC2626" }} />;
  }
  return <File className="h-4 w-4" style={{ color: "#64748B" }} />;
}

export function DocumentAttachmentPanel({
  entityType,
  entityId,
  initialDocuments,
  canWrite,
  canDelete,
  title,
  uploadLabel = "Document uploaden",
  emptyMessage = "Nog geen documenten gekoppeld.",
  namePlaceholder = "bijv. Foto, bewijsstuk of handleiding",
}: DocumentAttachmentPanelProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  }

  function resetForm() {
    setName("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open);
    if (!open) resetForm();
  }

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      showMessage("error", "Selecteer een bestand.");
      return;
    }
    if (!name.trim()) {
      showMessage("error", "Voer een naam in.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("entityType", entityType);
    formData.append("entityId", entityId);
    formData.append("file", file);

    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (result.success && result.data) {
        const uploaded: DocumentRow = {
          id: result.data.id,
          name: name.trim(),
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          entityType,
          entityId,
          entityName: null,
          uploadedBy: "",
          uploaderEmail: "",
          uploaderName: null,
          createdAt: new Date().toISOString(),
        };
        setDocuments((current) => [uploaded, ...current]);
        resetForm();
        setUploadOpen(false);
        showMessage("success", "Bestand gekoppeld.");
        return;
      }

      showMessage("error", (result as { message?: string }).message ?? "Uploaden mislukt.");
    });
  }

  function handleDownload(row: DocumentRow) {
    setDownloadingId(row.id);
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(row.id);
      setDownloadingId(null);
      if (result.success && result.data) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
        return;
      }

      showMessage("error", (result as { message?: string }).message ?? "Download mislukt.");
    });
  }

  function handleDelete(row: DocumentRow) {
    setDeletingId(row.id);
    startTransition(async () => {
      const result = await deleteDocument(row.id);
      setDeletingId(null);
      if (result.success) {
        setDocuments((current) => current.filter((doc) => doc.id !== row.id));
        showMessage("success", "Bestand verwijderd.");
      } else {
        showMessage("error", (result as { message?: string }).message ?? "Verwijderen mislukt.");
      }
      setDeleteTarget(null);
    });
  }

  return (
    <section className="veele-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--color-foreground)" }}>
            {title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Bestanden worden tenant-gebonden opgeslagen en downloads krijgen alleen een tijdelijke link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: "#F1F5F9", color: "#475569" }}>
            {documents.length} bestand{documents.length === 1 ? "" : "en"}
          </span>
          {canWrite && (
            <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              {uploadLabel}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 text-sm" style={{ color: message.type === "error" ? "#DC2626" : "#059669" }}>
          {message.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <DocumentUploadSheet
        open={uploadOpen}
        onOpenChange={handleUploadOpenChange}
        title={uploadLabel}
        name={name}
        onNameChange={setName}
        namePlaceholder={namePlaceholder}
        file={file}
        fileInputRef={fileRef}
        onFileChange={setFile}
        pending={isPending}
        submitLabel={uploadLabel}
        onSubmit={handleUpload}
      />

      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm" style={{ borderColor: "#CBD5E1", color: "#64748B" }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Naam</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Bestand</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Datum</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {getDocumentIcon(row.mimeType)}
                      <span className="truncate font-medium" style={{ color: "var(--color-foreground)" }} title={row.name}>
                        {row.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#64748B" }}>
                    <span className="block max-w-[240px] truncate" title={row.filename}>{row.filename}</span>
                    <span>{formatFileSize(row.sizeBytes)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "#64748B" }}>{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(row)}
                        disabled={downloadingId === row.id}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-50"
                        aria-label={`Download ${row.name}`}
                        title="Downloaden"
                        style={{ color: "#475569" }}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          disabled={deletingId === row.id}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-red-50 disabled:opacity-50"
                          aria-label={`Verwijder ${row.name}`}
                          title="Verwijderen"
                          style={{ color: "#DC2626" }}
                        >
                          <Trash2 className="h-4 w-4" />
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

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Document verwijderen?"
        description={deleteTarget ? `Weet u zeker dat u "${deleteTarget.name}" wilt verwijderen?` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </section>
  );
}
