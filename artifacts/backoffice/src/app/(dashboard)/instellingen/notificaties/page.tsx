import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getOrganizationSettings } from "@/app/actions/settings";
import { NotificatiesView } from "@/components/settings/NotificatiesView";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata: Metadata = { title: "Notificatie-instellingen" };

export default async function NotificatiesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const settings = await getOrganizationSettings();

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <SettingsTabs />
      <div className="mb-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/instellingen/organisatie" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Notificaties</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer welke automatische e-mailnotificaties het platform verstuurt naar medewerkers en klanten.
        </p>
      </div>

      <div className="max-w-2xl">
        <NotificatiesView settings={settings} canWrite={canWrite} />
      </div>
    </div>
  );
}
