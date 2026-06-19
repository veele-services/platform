import type { Metadata } from "next";
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
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <div className="mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          Contracten, certificaten, SLA-documenten en opdrachtbijlagen — centraal opgeslagen en beveiligd.
        </p>
      </div>

      <DocumentsView initialDocuments={documents} canWrite={canWrite} />
    </div>
  );
}
