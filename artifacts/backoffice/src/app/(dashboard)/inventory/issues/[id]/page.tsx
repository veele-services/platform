import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryIssueStatusPanel } from "@/components/inventory/InventoryIssueStatusPanel";
import { hasPermission } from "@/lib/auth/permissions";
import { getInventoryIssueDetail } from "@/app/actions/inventory-followup";

type Props = {
  params: Promise<{ id: string }>;
};

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
  const [canRead, canResolve, canManageMaintenance] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "resolve_issue").then(async (allowed) => allowed || await hasPermission("inventory", "manage")),
    hasPermission("inventory", "manage_maintenance").then(async (allowed) => allowed || await hasPermission("inventory", "manage")),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const issue = await getInventoryIssueDetail(id);
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
    </div>
  );
}
