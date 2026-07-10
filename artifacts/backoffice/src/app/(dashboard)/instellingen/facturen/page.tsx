import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { InvoiceSettingsView } from "@/components/settings/InvoiceSettingsView";
import { getInvoiceSettings } from "@/app/actions/invoice-settings";

export const metadata: Metadata = { title: "Factuurinstellingen" };

export default async function InvoiceSettingsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const settings = await getInvoiceSettings();

  return (
    <SettingsSectionShell
      title="Facturen"
      description="Beheer bedrijfsgegevens, factuurnummering, PDF-opmaak, betaalinformatie en Mollie-instellingen."
      size="wide"
    >
      <InvoiceSettingsView settings={settings} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
