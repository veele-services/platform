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

  const [
    documents,
    canWrite,
    canDelete,
    canUpdateMaterials,
    canManageMaterials,
    canUpdateInventory,
    canResolveInventoryIssues,
    canManageInventoryMaintenance,
    canManageInventory,
  ] = await Promise.all([
    listDocuments(),
    hasPermission("documents", "write"),
    hasPermission("documents", "delete"),
    hasPermission("materials", "update"),
    hasPermission("materials", "manage"),
    hasPermission("inventory", "update"),
    hasPermission("inventory", "resolve_issue"),
    hasPermission("inventory", "manage_maintenance"),
    hasPermission("inventory", "manage"),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1800px] p-6">
      <div className="mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          Contracten, certificaten, SLA-documenten en opdrachtbijlagen — centraal opgeslagen en beveiligd.
        </p>
      </div>

      <DocumentsView
        initialDocuments={documents}
        canWrite={canWrite}
        canDelete={canDelete}
        contextMutationCapabilities={{
          material: canUpdateMaterials || canManageMaterials,
          inventory_item: canUpdateInventory || canManageInventory,
          inventory_issue:
            canResolveInventoryIssues ||
            canManageInventoryMaintenance ||
            canManageInventory,
          inventory_maintenance:
            canManageInventoryMaintenance || canManageInventory,
        }}
      />
    </div>
  );
}
