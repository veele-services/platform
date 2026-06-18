import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listInvoices, getInvoiceSummary, getOverdueInvoicesCount } from "@/app/actions/invoices";
import { InvoicesView } from "@/components/invoices/InvoicesView";

export const metadata: Metadata = { title: "Facturen" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function InvoicesPage({ searchParams }: Props) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return <ForbiddenPage resource="invoices" action="read" />;

  const { page = "1", search = "", status = "" } = await searchParams;
  const canWrite = await hasPermission("invoices", "write");

  const [{ rows, total }, summary, overdueCount] = await Promise.all([
    listInvoices({ page: parseInt(page, 10) || 1, search, status }),
    getInvoiceSummary(),
    getOverdueInvoicesCount(),
  ]);

  return (
    <InvoicesView
      rows={rows}
      total={total}
      page={parseInt(page, 10) || 1}
      search={search}
      statusFilter={status}
      canWrite={canWrite}
      summary={summary}
      overdueCount={overdueCount}
    />
  );
}
