import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getOrganizationSettings } from "@/app/actions/settings";
import { MailSettingsView } from "@/components/settings/MailSettingsView";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata: Metadata = { title: "Mail-instellingen" };

export default async function MailSettingsPage() {
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
        <div className="mb-3 flex items-center gap-2 text-sm" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Mail</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Configureer SMTP, afzendergegevens en test of het platform e-mail kan afleveren.
        </p>
      </div>

      <div className="max-w-3xl">
        <MailSettingsView settings={settings} canWrite={canWrite} />
      </div>
    </div>
  );
}
