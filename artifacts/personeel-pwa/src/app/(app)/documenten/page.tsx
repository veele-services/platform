import { FolderOpen, FileText } from "lucide-react";
import { getMyDocuments } from "@/actions/documents";
import { DocumentDownloadButton } from "@/components/DocumentDownloadButton";

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("nl-NL", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.includes("pdf"))   return "PDF";
  if (mimeType.includes("word"))  return "Word";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("image")) return "Afbeelding";
  return "Bestand";
}

export default async function DocumentenPage() {
  const documents = await getMyDocuments();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn documenten
      </h1>

      {documents.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <FolderOpen size={32} className="mx-auto mb-3" style={{ color: "#94A3B8" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Geen documenten beschikbaar
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Documenten die de beheerder met u deelt, verschijnen hier.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
                >
                  <FileText size={18} style={{ color: "var(--color-primary)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm" style={{ color: "var(--color-primary)" }}>
                    {doc.name}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                    {mimeLabel(doc.mimeType)} · {formatBytes(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <DocumentDownloadButton documentId={doc.id} filename={doc.filename} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
