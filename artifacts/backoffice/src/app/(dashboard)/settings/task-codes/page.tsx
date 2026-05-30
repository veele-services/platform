import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { TaskCodesView } from "@/components/task-codes/TaskCodesView";
import {
  listTaskCodes,
  listSectorsForTaskCodes,
  listRolesForTaskCodes,
} from "@/app/actions/task-codes";

export const metadata: Metadata = { title: "Task Codes" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default async function TaskCodesPage({ searchParams }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("task_codes", "read"),
    hasPermission("task_codes", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="taakcodes" action="read" />;

  const sp       = await searchParams;
  const search   = str(sp.search);
  const sectorId = str(sp.sectorId);
  const invoice  = str(sp.invoice, "all");
  const status   = str(sp.status,  "all");
  const page     = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort     = str(sp.sort, "code");
  const dir      = str(sp.dir,  "asc");

  const [{ rows, total }, sectors, roles] = await Promise.all([
    listTaskCodes({ search, sectorId, invoiceable: invoice, status, page, sort, dir }),
    listSectorsForTaskCodes(),
    listRolesForTaskCodes(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <span>Instellingen</span>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Taakcodes</span>
        </div>
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Taakcodes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} code{total !== 1 ? "s" : ""}
          {search ? ` die overeenkomen met "${search}"` : ""}
          {" — "}Centraal beheerde catalogus voor opdrachten, planning en facturering.
        </p>
      </div>

      <TaskCodesView
        rows={rows}
        total={total}
        sectors={sectors}
        roles={roles}
        canWrite={canWrite}
        page={page}
        initialSearch={search}
        initialSectorId={sectorId}
        initialInvoice={invoice}
        initialStatus={status}
        initialSort={sort}
        initialDir={dir}
      />
    </div>
  );
}
