import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { BrandThemeForm } from "@/components/theme/BrandThemeForm";
import { getTenantThemeSettings } from "@/app/actions/theme-settings";

export const metadata: Metadata = { title: "Branding & thema" };

export default async function BrandingPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const settings = await getTenantThemeSettings();

  return (
    <SettingsSectionShell
      title="Branding & thema"
      description="Beheer de tenantnaam, huisstijl, logo's en e-mailstijl voor deze tenant."
      size="wide"
    >
      <BrandThemeForm
        mode="tenant"
        theme={settings.theme}
        useCustomTheme={settings.useCustomTheme}
        canWrite={canWrite}
      />
    </SettingsSectionShell>
  );
}
