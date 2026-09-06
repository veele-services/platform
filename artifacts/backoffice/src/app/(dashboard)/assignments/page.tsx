import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";
import { getCustomerOptions } from "@/app/actions/assignments";
import { listAssignmentsRegionAware } from "@/app/actions/region-runtime";
import { listRegionOptions } from "@/app/actions/regions";

export const metadata: Metadata = {
  title: "Assignments",
};

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    priority?: string;
    reportStatus?: string;
    region?: string;
    sort?: string;
    dir?: string;
    create?: string;
  }>;
}

export default async function AssignmentsPage({ searchParams }: Props) {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return <ForbiddenPage resource="assignments" action="read" />;

  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.search ?? "";
  const status = sp.status ?? "";
  const priority = sp.priority ?? "";
  const reportStatus = sp.reportStatus ?? "";
  const region = sp.region ?? "";
  const sort = sp.sort ?? "createdAt";
  const dir = sp.dir ?? "desc";

  const [{ rows, total }, customers, regionOptions, canWrite, canDelete] =
    await Promise.all([
      listAssignmentsRegionAware({
        page,
        search,
        status,
        priority,
        reportStatus,
        region,
        sort,
        dir,
      }),
      getCustomerOptions(),
      listRegionOptions(),
      hasPermission("assignments", "write"),
      hasPermission("assignments", "delete"),
    ]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
      <AssignmentsView
        rows={rows}
        total={total}
        customers={customers}
        regionOptions={regionOptions}
        canWrite={canWrite}
        canDelete={canDelete}
        page={page}
        initialSearch={search}
        initialStatus={status}
        initialPriority={priority}
        initialReportStatus={reportStatus}
        initialRegion={region}
        initialSort={sort}
        initialDir={dir}
        initialCreateOpen={sp.create === "1"}
      />
    </div>
  );
}
