import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getOrganizationSettings } from "@/app/actions/settings";
import { MailSettingsView } from "@/components/settings/MailSettingsView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Mail-instellingen" };

export default async function MailSettingsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const settings = await getOrganizationSettings();

  return (
    <SettingsSectionShell
      title="Mail"
      description="Configureer SMTP, afzendergegevens en test of het platform e-mail kan afleveren."
      size="default"
    >
      <MailSettingsView settings={settings} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
