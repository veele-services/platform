import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Boxes } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { MaterialsView } from "@/components/materials/MaterialsView";
import { listMaterialManagementOptions, listMaterials } from "@/app/actions/materials";

export const metadata: Metadata = { title: "Materiaalbeheer" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(value: string | string[] | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export default async function MaterialsPage({ searchParams }: Props) {
  const [canRead, canWrite, canAdjust, canTransfer] = await Promise.all([
    hasPermission("materials", "view"),
    hasPermission("materials", "create"),
    hasPermission("materials", "adjust_stock"),
    hasPermission("materials", "transfer_stock"),
  ]);

  if (!canRead) return <ForbiddenPage resource="materials" action="view" />;

  const sp = await searchParams;
  const search = str(sp.search);
  const status = str(sp.status, "active");
  const categoryId = str(sp.categoryId);
  const page = Math.max(1, parseInt(str(sp.page, "1"), 10) || 1);

  const [{ rows, total }, options] = await Promise.all([
    listMaterials({ search, status, categoryId, page }),
    listMaterialManagementOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1700px] p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5" style={{ color: "#0F766E" }} />
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Materiaalbeheer
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Catalogus, voorraad per object/personeel en voorraadmutaties.
          </p>
        </div>
        <Link
          href="/materials/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium"
          style={{ borderColor: "#CBD5E1", color: "#334155" }}
        >
          <BarChart3 className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      <MaterialsView
        rows={rows}
        total={total}
        options={options}
        canWrite={canWrite}
        canAdjust={canAdjust || canTransfer}
        page={page}
        initialSearch={search}
        initialStatus={status}
        initialCategoryId={categoryId}
      />
    </div>
  );
}
