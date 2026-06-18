import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listDocuments } from "@/app/actions/documents";
import { DocumentsView } from "@/components/documents/DocumentsView";

export const metadata: Metadata = {
  title: "Documenten",
};

export default async function DocumentsPage() {
  if (!(await hasPermission("documents", "read"))) {
    return <ForbiddenPage resource="documents" action="read" />;
  }

  const [documents, canWrite] = await Promise.all([
    listDocuments(),
    hasPermission("documents", "write"),
  ]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FolderOpen className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
          <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
            Documenten
          </h1>
        </div>
        <p className="text-sm" style={{ color: "#64748B" }}>
          Contracten, certificaten, SLA-documenten en opdrachtbijlagen — centraal opgeslagen en beveiligd.
        </p>
      </div>

      <DocumentsView initialDocuments={documents} canWrite={canWrite} />
    </div>
  );
}
