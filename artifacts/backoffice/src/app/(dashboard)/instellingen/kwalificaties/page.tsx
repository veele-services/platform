import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { QualificationsView } from "@/components/settings/QualificationsView";
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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Kwalificaties
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer certificaten, diploma&apos;s en kennisgebieden voor personeelsbeheer, taakcodes en slimme planning.
        </p>
      </div>
      <SettingsTabs />
      <QualificationsView data={data} canWrite={canWrite} />
    </div>
  );
}
