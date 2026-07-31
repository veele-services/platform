export const dynamic = "force-dynamic";

import {
  PersonnelSettingsCard,
  PersonnelSettingsShell,
} from "@/components/SettingsShell";
import { isTenantModuleEnabled } from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

export default async function InstellingenPage() {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const notificationsEnabled = tenantId
    ? await isTenantModuleEnabled(tenantId, "notifications")
    : false;
  return (
    <PersonnelSettingsShell
      active="overview"
      title="Instellingen"
      subtitle="Beheer je profiel, beveiliging en meldingen."
      notificationsEnabled={notificationsEnabled}
    >
      <PersonnelSettingsCard>
        <h2 className="text-base font-semibold text-[var(--color-primary)]">
          Kies een onderdeel
        </h2>
        <p className="mt-1 text-sm leading-5 text-[var(--color-secondary)]">
          Gebruik de navigatie om je profiel, meldingen of beveiliging te
          beheren.
        </p>
      </PersonnelSettingsCard>
    </PersonnelSettingsShell>
  );
}
