import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { MaterialsDashboardView } from "@/components/materials/MaterialsDashboardView";
import { getMaterialsDashboard } from "@/app/actions/material-inventory-reports";

export const metadata: Metadata = { title: "Materiaal dashboard" };

export default async function MaterialsDashboardPage() {
  const canRead = await hasPermission("materials", "view");
  if (!canRead) return <ForbiddenPage resource="materials" action="view" />;

  const data = await getMaterialsDashboard();

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/materials" className="mb-3 inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
            <ArrowLeft className="h-4 w-4" />
            Materiaalbeheer
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" style={{ color: "#0F766E" }} />
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Materiaal dashboard
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Lage voorraad, negatieve voorraad, materiaalverbruik en klantzichtbare rapportage.
          </p>
        </div>
      </div>

      <MaterialsDashboardView data={data} />
    </div>
  );
}
