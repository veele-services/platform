import type { Metadata } from "next";
import { History } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAuditLog } from "@/app/actions/settings";
import { ActiviteitslogView } from "@/components/settings/ActiviteitslogView";

export const metadata: Metadata = { title: "Activiteitslog" };

interface Props {
  searchParams: Promise<{
    page?:     string;
    search?:   string;
    module?:   string;
    dateFrom?: string;
    dateTo?:   string;
  }>;
}

export default async function ActiviteitslogPage({ searchParams }: Props) {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return <ForbiddenPage resource="activiteitslog" action="read" />;

  const sp = await searchParams;

  const page     = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search   = sp.search   ?? "";
  const module   = sp.module   ?? "";
  const dateFrom = sp.dateFrom ?? "";
  const dateTo   = sp.dateTo   ?? "";

  const { entries, total } = await listAuditLog({ page, search, module, dateFrom, dateTo });

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/instellingen" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Activiteitslog</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg w-10 h-10 flex-shrink-0"
            style={{ backgroundColor: "#E0FAFB" }}
          >
            <History className="h-5 w-5" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Activiteitslog
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>
              Chronologisch overzicht van alle platformactiviteit.
            </p>
          </div>
        </div>
      </div>

      <ActiviteitslogView
        entries={entries}
        total={total}
        page={page}
        initialSearch={search}
        initialModule={module}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
      />
    </div>
  );
}
