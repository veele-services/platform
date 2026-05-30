import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { PersonnelView } from "@/components/personnel/PersonnelView";
import { listPersonnel, listRoles } from "@/app/actions/personnel";

export const metadata: Metadata = { title: "Personnel" };

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

  const sp     = await searchParams;
  const search = str(sp.search);
  const roleId = str(sp.roleId);
  const region = str(sp.region);
  const status = str(sp.status, "all");
  const page   = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort   = str(sp.sort, "lastName");
  const dir    = str(sp.dir, "asc");

  const [{ rows, total }, roles] = await Promise.all([
    listPersonnel({ search, roleId, region, status, page, sort, dir }),
    listRoles(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Personnel
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} record{total !== 1 ? "s" : ""}
          {search ? ` matching "${search}"` : ""}
        </p>
      </div>

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
      />
    </div>
  );
}
