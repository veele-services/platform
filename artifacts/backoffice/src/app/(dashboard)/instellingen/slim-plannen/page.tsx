import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { SmartPlanningRulesView } from "@/components/settings/SmartPlanningRulesView";
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
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Slim plannen
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer per sector hoe geschikte medewerkers worden gewogen voor capaciteit, topmatches en interessepeilingen.
        </p>
      </div>
      <SettingsTabs />
      <SmartPlanningRulesView data={data} canWrite={canWriteSettings || canWritePlanning} />
    </div>
  );
}
