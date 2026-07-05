import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAllCustomerTypes } from "@/app/actions/customers";
import { CustomerTypesManager } from "@/components/settings/CustomerTypesManager";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Klanttypes" };

export default async function KlanttypesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const customerTypes = await listAllCustomerTypes();

  return (
    <SettingsSectionShell
      title="Klanttypes"
      description="Beheer de klanttypes die beschikbaar zijn in klantprofielen."
      size="default"
    >
      <CustomerTypesManager initialTypes={customerTypes} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
