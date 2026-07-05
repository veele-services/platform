import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAuditLog, listRoles } from "@/app/actions/settings";
import { ActiviteitslogView } from "@/components/settings/ActiviteitslogView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Activiteitslog" };

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    module?: string;
    dateFrom?: string;
    dateTo?: string;
    roleId?: string;
  }>;
}

export default async function ActiviteitslogPage({ searchParams }: Props) {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return <ForbiddenPage resource="activiteitslog" action="read" />;

  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.search ?? "";
  const module = sp.module ?? "";
  const dateFrom = sp.dateFrom ?? "";
  const dateTo = sp.dateTo ?? "";
  const roleId = sp.roleId ?? "";

  const [{ entries, total }, roles] = await Promise.all([
    listAuditLog({ page, search, module, dateFrom, dateTo, roleId }),
    listRoles().catch(() => []),
  ]);

  return (
    <SettingsSectionShell title="Activiteitslog" description="Chronologisch overzicht van alle platformactiviteit.">
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
    </SettingsSectionShell>
  );
}
