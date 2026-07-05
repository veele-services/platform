import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { QualificationsView } from "@/components/settings/QualificationsView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { listQualificationManagementData } from "@/app/actions/qualifications";

export const metadata: Metadata = {
  title: "Kwalificaties",
};

export default async function QualificationsSettingsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="settings" action="read" />;

  const data = await listQualificationManagementData();

  return (
    <SettingsSectionShell
      title="Kwalificaties"
      description="Beheer certificaten, diploma's en kennisgebieden voor personeelsbeheer, taakcodes en slimme planning."
    >
      <QualificationsView data={data} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
