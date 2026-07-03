import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryDetailView } from "@/components/inventory/InventoryDetailView";
import { getInventoryDetail, listInventoryManagementOptions } from "@/app/actions/inventory";
import { getInventoryFollowupSummary } from "@/app/actions/inventory-followup";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("inventory", "view");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const item = await getInventoryDetail(id);
    return { title: item?.name ?? "Inventaris" };
  } catch {
    return { title: "Inventaris" };
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Geen gepland onderhoud";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

export default async function InventoryDetailPage({ params }: Props) {
  const [canRead, canUpdate, canManage] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "update"),
    hasPermission("inventory", "manage"),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const [item, options, followup] = await Promise.all([
    getInventoryDetail(id),
    listInventoryManagementOptions(),
    getInventoryFollowupSummary(id),
  ]);

  if (!item) notFound();

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-8 pt-8">
        <div className="flex justify-end gap-2">
          <Link
            href={`/inventory/issues?status=open&itemId=${item.id}`}
            className="inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            Storingen
          </Link>
          <Link
            href={`/inventory/${item.id}/qr`}
            className="inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            QR-label printen
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FollowupMetric label="Open storingen" value={String(followup.openIssueCount)} tone={followup.openIssueCount > 0 ? "warn" : "neutral"} />
          <FollowupMetric label="Urgent/hoog" value={String(followup.urgentIssueCount)} tone={followup.urgentIssueCount > 0 ? "danger" : "neutral"} />
          <FollowupMetric label="Volgende onderhoud" value={formatDate(followup.nextMaintenanceDueDate)} tone={followup.overdueMaintenanceCount > 0 ? "danger" : "neutral"} />
        </div>
      </div>
      <InventoryDetailView item={item} options={options} canWrite={canUpdate || canManage} />
    </>
  );
}

function FollowupMetric({ label, value, tone }: { label: string; value: string; tone: "neutral" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#B91C1C" : tone === "warn" ? "#B45309" : "#081D3A";
  return (
    <div className="rounded-md border bg-white px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
      <p className="text-xs font-semibold uppercase" style={{ color: "#64748B" }}>{label}</p>
      <p className="mt-1 truncate text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
