import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SectorsManager } from "@/components/settings/SectorsManager";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { listAllSectors } from "@/app/actions/sectors";

export const metadata: Metadata = { title: "Sectoren" };

export default async function SectorenPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const sectors = await listAllSectors();

  return (
    <SettingsSectionShell
      title="Sectoren"
      description="Beheer de operationele sectoren voor klanten, objecten, medewerkers, taakcodes en planning."
    >
      <SectorsManager initialSectors={sectors} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
