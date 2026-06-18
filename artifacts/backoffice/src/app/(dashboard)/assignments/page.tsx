import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";
import {
  listAssignments,
  getCustomerOptions,
} from "@/app/actions/assignments";

export const metadata: Metadata = {
  title: "Assignments",
};

interface Props {
  searchParams: Promise<{
    page?:         string;
    search?:       string;
    status?:       string;
    priority?:     string;
    reportStatus?: string;
    sort?:         string;
    dir?:          string;
  }>;
}

export default async function AssignmentsPage({ searchParams }: Props) {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return <ForbiddenPage resource="assignments" action="read" />;

  const sp = await searchParams;

  const page         = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search       = sp.search       ?? "";
  const status       = sp.status       ?? "";
  const priority     = sp.priority     ?? "";
  const reportStatus = sp.reportStatus ?? "";
  const sort         = sp.sort         ?? "createdAt";
  const dir          = sp.dir          ?? "desc";

  const [{ rows, total }, customers, canWrite] = await Promise.all([
    listAssignments({ page, search, status, priority, reportStatus, sort, dir }),
    getCustomerOptions(),
    hasPermission("assignments", "write"),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <p className="mb-4 text-sm" style={{ color: "#64748B" }}>
        {total === 0
          ? "Nog geen opdrachten aangemaakt."
          : `${total} opdracht${total !== 1 ? "en" : ""} in totaal`}
      </p>

      <AssignmentsView
        rows={rows}
        total={total}
        customers={customers}
        canWrite={canWrite}
        page={page}
        initialSearch={search}
        initialStatus={status}
        initialPriority={priority}
        initialReportStatus={reportStatus}
        initialSort={sort}
        initialDir={dir}
      />
    </div>
  );
}
