import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryDashboardView } from "@/components/inventory/InventoryDashboardView";
import { getInventoryDashboard } from "@/app/actions/material-inventory-reports";

export const metadata: Metadata = { title: "Inventaris dashboard" };

export default async function InventoryDashboardPage() {
  const canRead = await hasPermission("inventory", "view");
  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const data = await getInventoryDashboard();

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
            <ArrowLeft className="h-4 w-4" />
            Inventarisbeheer
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" style={{ color: "#0F766E" }} />
            <h1 className="font-heading text-2xl font-bold" style={{ color: "var(--color-foreground)" }}>
              Inventaris dashboard
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Status, storingen, onderhoud, keuringen, werkbongebruik en verhuurcontrole.
          </p>
        </div>
      </div>

      <InventoryDashboardView data={data} />
    </div>
  );
}
