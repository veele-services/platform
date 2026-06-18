import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listReports } from "@/app/actions/reports";
import { ReportsView } from "@/components/reports/ReportsView";

export const metadata: Metadata = {
  title: "Rapporten",
};

interface Props {
  searchParams: Promise<{
    page?:   string;
    search?: string;
    status?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return <ForbiddenPage resource="reports" action="read" />;

  const sp = await searchParams;
  const page   = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.search ?? "";
  const status = sp.status ?? "";

  const [{ rows, total }, canWrite] = await Promise.all([
    listReports({ page, search, status }),
    hasPermission("reports", "write"),
  ]);

  return (
    <ReportsView
      rows={rows}
      total={total}
      page={page}
      search={search}
      statusFilter={status}
      canWrite={canWrite}
    />
  );
}
