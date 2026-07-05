import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getOrganizationSettings } from "@/app/actions/settings";
import { OrganisatieForm } from "@/components/settings/OrganisatieForm";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Organisatie-instellingen" };

export default async function OrganisatiePage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const settings = await getOrganizationSettings();

  return (
    <SettingsSectionShell
      title="Organisatie"
      description="Basisgegevens die worden gebruikt in facturen, correspondentie en personeelsinstellingen."
      size="default"
    >
      <OrganisatieForm settings={settings} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
