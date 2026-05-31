import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { CustomersView } from "@/components/customers/CustomersView";
import { listCustomers, listSectors } from "@/app/actions/customers";

export const metadata: Metadata = { title: "Customers" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default async function CustomersPage({ searchParams }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("customers", "read"),
    hasPermission("customers", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="customers" action="read" />;

  const sp = await searchParams;
  const search   = str(sp.search);
  const sectorId = str(sp.sectorId);
  const status   = str(sp.status, "all");
  const page     = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort     = str(sp.sort, "name");
  const dir      = str(sp.dir, "asc");

  const [{ rows, total }, sectors] = await Promise.all([
    listCustomers({ search, sectorId, status, page, sort, dir }),
    listSectors(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Klanten
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} klant{total !== 1 ? "en" : ""}
          {search ? ` die overeenkomen met "${search}"` : ""}
        </p>
      </div>

      <CustomersView
        rows={rows}
        total={total}
        sectors={sectors}
        canWrite={canWrite}
        canWriteNotes={canWrite}
        page={page}
        initialSearch={search}
        initialSectorId={sectorId}
        initialStatus={status}
        initialSort={sort}
        initialDir={dir}
      />
    </div>
  );
}
