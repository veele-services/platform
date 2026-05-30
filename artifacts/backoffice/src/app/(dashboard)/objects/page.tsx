import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { ObjectsView } from "@/components/objects/ObjectsView";
import { listObjects, listCustomerOptions } from "@/app/actions/objects";
import { listSectors } from "@/app/actions/customers";

export const metadata: Metadata = { title: "Objects" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default async function ObjectsPage({ searchParams }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("objects", "read"),
    hasPermission("objects", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="objects" action="read" />;

  const sp         = await searchParams;
  const search     = str(sp.search);
  const customerId = str(sp.customerId);
  const sectorId   = str(sp.sectorId);
  const status     = str(sp.status, "all");
  const page       = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort       = str(sp.sort, "name");
  const dir        = str(sp.dir, "asc");

  const [{ rows, total }, sectors, customers] = await Promise.all([
    listObjects({ search, customerId, sectorId, status, page, sort, dir }),
    listSectors(),
    listCustomerOptions(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Objecten
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} object{total !== 1 ? "en" : ""}
          {search ? ` die overeenkomen met "${search}"` : ""}
        </p>
      </div>

      <ObjectsView
        rows={rows}
        total={total}
        sectors={sectors}
        customers={customers}
        canWrite={canWrite}
        page={page}
        initialSearch={search}
        initialCustomerId={customerId}
        initialSectorId={sectorId}
        initialStatus={status}
        initialSort={sort}
        initialDir={dir}
      />
    </div>
  );
}
