import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { DocumentAttachmentPanel } from "@/components/documents/DocumentAttachmentPanel";
import { InventoryIssueStatusPanel } from "@/components/inventory/InventoryIssueStatusPanel";
import { hasPermission } from "@/lib/auth/permissions";
import { listDocuments, type DocumentEntityType, type DocumentRow } from "@/app/actions/documents";
import { getInventoryIssueDetail } from "@/app/actions/inventory-followup";

type Props = {
  params: Promise<{ id: string }>;
};

async function listContextDocuments(
  canReadDocuments: boolean,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentRow[]> {
  if (!canReadDocuments) return [];
  try {
    return await listDocuments({ entityType, entityId });
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("inventory", "view");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const issue = await getInventoryIssueDetail(id);
    return { title: issue ? `Storing ${issue.inventoryCode}` : "Inventarisstoring" };
  } catch {
    return { title: "Inventarisstoring" };
  }
}

export default async function InventoryIssueDetailPage({ params }: Props) {
  const [canRead, canResolve, canManageMaintenance, canReadDocuments, canWriteDocuments] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "resolve_issue").then(async (allowed) => allowed || await hasPermission("inventory", "manage")),
    hasPermission("inventory", "manage_maintenance").then(async (allowed) => allowed || await hasPermission("inventory", "manage")),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const [issue, documents] = await Promise.all([
    getInventoryIssueDetail(id),
    listContextDocuments(canReadDocuments, "inventory_issue", id),
  ]);
  if (!issue) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/inventory/issues" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
          <ArrowLeft className="h-4 w-4" />
          Inventarisstoringen
        </Link>
        <Link href={`/inventory/${issue.inventoryItemId}`} className="rounded-md border px-3 py-2 text-sm font-medium" style={{ borderColor: "#CBD5E1", color: "#334155" }}>
          Open inventarisitem
        </Link>
      </div>

      <div className="veele-card">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Storing {issue.inventoryCode}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Statusflow, onderhoud, keuring en opvolging voor {issue.inventoryName}.
        </p>
      </div>

      <InventoryIssueStatusPanel
        issue={issue}
        canResolve={canResolve}
        canManageMaintenance={canManageMaintenance}
      />

      {canReadDocuments && (
        <DocumentAttachmentPanel
          entityType="inventory_issue"
          entityId={issue.id}
          initialDocuments={documents}
          canWrite={canWriteDocuments && (canResolve || canManageMaintenance)}
          title="Storingmedia en bewijs"
          uploadLabel="Bewijs koppelen"
          emptyMessage="Nog geen foto, video-notitie of bewijsstuk gekoppeld."
          namePlaceholder="bijv. Foto defect, leverancierbewijs of afhandelbewijs"
        />
      )}
    </div>
  );
}
