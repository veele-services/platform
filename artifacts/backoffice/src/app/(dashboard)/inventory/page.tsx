import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, PackageSearch } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryView } from "@/components/inventory/InventoryView";
import { listInventory, listInventoryManagementOptions } from "@/app/actions/inventory";

export const metadata: Metadata = { title: "Inventarisbeheer" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(value: string | string[] | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export default async function InventoryPage({ searchParams }: Props) {
  const [canRead, canCreate, canUpdate, canManage] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "create"),
    hasPermission("inventory", "update"),
    hasPermission("inventory", "manage"),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const sp = await searchParams;
  const search = str(sp.search);
  const status = str(sp.status, "active");
  const categoryId = str(sp.categoryId);
  const page = Math.max(1, parseInt(str(sp.page, "1"), 10) || 1);

  const [{ rows, total }, options] = await Promise.all([
    listInventory({ search, status, categoryId, page }),
    listInventoryManagementOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1800px] p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5" style={{ color: "#0F766E" }} />
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Inventarisbeheer
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Register, status, locatie en dossierkoppelingen voor inventarisitems.
          </p>
        </div>
        <Link
          href="/inventory/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium"
          style={{ borderColor: "#CBD5E1", color: "#334155" }}
        >
          <BarChart3 className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      <InventoryView
        rows={rows}
        total={total}
        options={options}
        canWrite={canCreate || canUpdate || canManage}
        page={page}
        initialSearch={search}
        initialStatus={status}
        initialCategoryId={categoryId}
      />
    </div>
  );
}
