export const dynamic = "force-dynamic";

import { FolderOpen, FileText } from "lucide-react";
import { getMyDocuments } from "@/actions/documents";
import { DocumentDownloadButton } from "@/components/DocumentDownloadButton";
import { PageShell } from "@/components/PageShell";

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

export default async function DocumentenPage() {
  const documents = await getMyDocuments();

  return (
    <PageShell
      title="Documenten"
      subtitle="Bestanden die door Veele Services met u gedeeld zijn."
    >
      {documents.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <FolderOpen
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--color-muted-fg)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-primary)" }}
          >
            Geen documenten beschikbaar
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-secondary)" }}
          >
            Documenten die de beheerder met u deelt, verschijnen hier.
          </p>
        </div>
      ) : (
        <>
          <div
            className="hidden overflow-x-auto rounded-[22px] border bg-white shadow-sm md:block"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[minmax(20rem,1.5fr)_8rem_8rem_10rem_9rem] gap-4 border-b px-5 py-3 text-xs font-black uppercase tracking-[0.08em]"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-secondary)",
              }}
            >
              <span>Document</span>
              <span>Type</span>
              <span>Grootte</span>
              <span>Datum</span>
              <span className="text-right">Actie</span>
            </div>
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-border)" }}
            >
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[minmax(20rem,1.5fr)_8rem_8rem_10rem_9rem] items-center gap-4 px-5 py-4"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
                    >
                      <FileText
                        size={18}
                        style={{ color: "var(--color-primary)" }}
                      />
                    </span>
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
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {mimeLabel(doc.mimeType)}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {formatBytes(doc.sizeBytes)}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {formatDate(doc.createdAt)}
                  </span>
                  <span className="flex justify-end">
                    <DocumentDownloadButton
                      documentId={doc.id}
                      filename={doc.filename}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
                  >
                    <FileText
                      size={18}
                      style={{ color: "var(--color-primary)" }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-semibold text-sm"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {doc.name}
                    </p>
                    <p
                      className="mt-0.5 text-xs"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {mimeLabel(doc.mimeType)} · {formatBytes(doc.sizeBytes)} ·{" "}
                      {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <DocumentDownloadButton
                    documentId={doc.id}
                    filename={doc.filename}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
