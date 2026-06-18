import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { PersonnelView } from "@/components/personnel/PersonnelView";
import { PersonnelStatBar } from "@/components/personnel/PersonnelStatBar";
import { PersonnelWidgets } from "@/components/personnel/PersonnelWidgets";
import {
  listPersonnel,
  listRoles,
  getPersonnelStats,
  getFlexpoolToday,
  getCapacityByRole,
} from "@/app/actions/personnel";

export const metadata: Metadata = { title: "Personeel" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default async function PersonnelPage({ searchParams }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("personnel", "read"),
    hasPermission("personnel", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="personnel" action="read" />;

  const sp            = await searchParams;
  const search        = str(sp.search);
  const roleId        = str(sp.roleId);
  const region        = str(sp.region);
  const status        = str(sp.status, "all");
  const personnelType = str(sp.personnelType);
  const page          = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort          = str(sp.sort, "lastName");
  const dir           = str(sp.dir, "asc");

  const [{ rows, total }, roles, stats, flexpoolRows, capacityRows] = await Promise.all([
    listPersonnel({ search, roleId, region, status, personnelType, page, sort, dir }),
    listRoles(),
    getPersonnelStats(),
    getFlexpoolToday(),
    getCapacityByRole(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <p className="mb-4 text-sm" style={{ color: "#64748B" }}>
        {total} medewerker{total !== 1 ? "s" : ""}
        {search ? ` die overeenkomen met "${search}"` : ""}
      </p>

      {/* Stat bar */}
      <PersonnelStatBar stats={stats} />

      {/* List */}
      <PersonnelView
        rows={rows}
        total={total}
        roles={roles}
        canWrite={canWrite}
        page={page}
        initialSearch={search}
        initialRoleId={roleId}
        initialRegion={region}
        initialStatus={status}
        initialSort={sort}
        initialDir={dir}
        initialPersonnelType={personnelType}
      />

      {/* Dashboard widgets */}
      <PersonnelWidgets
        flexpoolRows={flexpoolRows}
        capacityRows={capacityRows}
        stats={stats}
      />
    </div>
  );
}
