import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SmartPlanningRulesView } from "@/components/settings/SmartPlanningRulesView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { listSmartPlanningSectorRules } from "@/app/actions/smart-planning-settings";

export const metadata: Metadata = {
  title: "Slim plannen",
};

export default async function SmartPlanningSettingsPage() {
  const [canReadSettings, canReadPlanning, canWriteSettings, canWritePlanning] =
    await Promise.all([
      hasPermission("settings", "read"),
      hasPermission("planning", "read"),
      hasPermission("settings", "write"),
      hasPermission("planning", "write"),
    ]);

  if (!canReadSettings && !canReadPlanning) {
    return <ForbiddenPage resource="planning" action="read" />;
  }

  const data = await listSmartPlanningSectorRules();

  return (
    <SettingsSectionShell
      title="Slim plannen"
      description="Beheer per sector hoe geschikte medewerkers worden gewogen voor capaciteit, topmatches en interessepeilingen."
    >
      <SmartPlanningRulesView data={data} canWrite={canWriteSettings || canWritePlanning} />
    </SettingsSectionShell>
  );
}
