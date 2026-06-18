import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { SectorsManager } from "@/components/settings/SectorsManager";
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
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <SettingsTabs />
      <div className="mb-6 max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-sm" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Sectoren</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer de operationele sectoren voor klanten, objecten, medewerkers, taakcodes en planning.
        </p>
      </div>

      <SectorsManager initialSectors={sectors} canWrite={canWrite} />
    </div>
  );
}
