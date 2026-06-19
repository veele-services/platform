import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAuditLog, listRoles } from "@/app/actions/settings";
import { ActiviteitslogView } from "@/components/settings/ActiviteitslogView";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata: Metadata = { title: "Activiteitslog" };

interface Props {
  searchParams: Promise<{
    page?:     string;
    search?:   string;
    module?:   string;
    dateFrom?: string;
    dateTo?:   string;
    roleId?:   string;
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
  const roleId   = sp.roleId   ?? "";

  const [{ entries, total }, roles] = await Promise.all([
    listAuditLog({ page, search, module, dateFrom, dateTo, roleId }),
    listRoles().catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <SettingsTabs />
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/instellingen" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Activiteitslog</span>
        </div>
        <p className="text-sm" style={{ color: "#64748B" }}>
          Chronologisch overzicht van alle platformactiviteit.
        </p>
      </div>

      <ActiviteitslogView
        entries={entries}
        total={total}
        page={page}
        initialSearch={search}
        initialModule={module}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        initialRoleId={roleId}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
