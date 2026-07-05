import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { DocumentAttachmentPanel } from "@/components/documents/DocumentAttachmentPanel";
import { InventoryIssueStatusPanel } from "@/components/inventory/InventoryIssueStatusPanel";
import {
  TenantDetailHeader,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { listDocuments, type DocumentEntityType, type DocumentRow } from "@/app/actions/documents";
import { getInventoryIssueDetail } from "@/app/actions/inventory-followup";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  in_progress: "In behandeling",
  waiting_supplier: "Wacht op leverancier",
  resolved: "Opgelost",
  unresolvable: "Niet op te lossen",
  cancelled: "Geannuleerd",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

function severityClass(severity: string): string {
  return severity === "urgent" || severity === "high"
    ? "bg-red-50 text-red-700"
    : "bg-slate-100 text-slate-700";
}

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
    <TenantPageShell size="wide">
      <TenantDetailHeader
        backHref="/inventory/issues"
        backLabel="Inventarisstoringen"
        title={`Storing ${issue.inventoryCode}`}
        description={`Review, statusflow en onderhoudsopvolging voor ${issue.inventoryName}.`}
        badges={
          <>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${severityClass(issue.severity)}`}>
              {SEVERITY_LABELS[issue.severity] ?? issue.severity}
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
              {STATUS_LABELS[issue.status] ?? issue.status}
            </span>
          </>
        }
        actions={
          <Link href={`/inventory/${issue.inventoryItemId}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium">
            Open inventarisitem
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
        meta={[
          { label: "Object", value: issue.objectName ?? "-" },
          { label: "Personeel", value: issue.personnelName ?? "-" },
          { label: "Werkbon", value: issue.assignmentCode ?? "-" },
        ]}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Review", href: "#review", active: true },
          { label: "Onderhoud", href: "#onderhoud", count: issue.maintenanceEvents.length },
          { label: "Bewijs", href: "#bewijs", count: documents.length },
        ]}
      />

      <InventoryIssueStatusPanel
        issue={issue}
        canResolve={canResolve}
        canManageMaintenance={canManageMaintenance}
      />

      {canReadDocuments && (
        <section id="bewijs">
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
        </section>
      )}
    </TenantPageShell>
  );
}
