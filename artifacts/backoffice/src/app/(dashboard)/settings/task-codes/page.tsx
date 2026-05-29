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

  if (!canRead) return <ForbiddenPage resource="task codes" action="read" />;

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
          <span>Settings</span>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Task Codes</span>
        </div>
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Task Codes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} code{total !== 1 ? "s" : ""}
          {search ? ` matching "${search}"` : ""}
          {" — "}Centrally managed catalog used across assignments, planning, and invoicing.
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
