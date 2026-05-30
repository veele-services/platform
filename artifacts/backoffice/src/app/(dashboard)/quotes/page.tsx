import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listQuotes, getQuoteSummary } from "@/app/actions/quotes";
import { QuotesView } from "@/components/quotes/QuotesView";

export const metadata: Metadata = { title: "Offertes" };

export default async function QuotesPage() {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return <ForbiddenPage resource="quotes" action="read" />;

  const [{ rows, total }, summary] = await Promise.all([
    listQuotes({ page: 1 }),
    getQuoteSummary(),
  ]);

  return <QuotesView initialRows={rows} initialTotal={total} summary={summary} />;
}
