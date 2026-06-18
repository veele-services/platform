import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAllCustomerTypes } from "@/app/actions/customers";
import { CustomerTypesManager } from "@/components/settings/CustomerTypesManager";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata: Metadata = { title: "Klanttypes" };

export default async function KlanttypesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const customerTypes = await listAllCustomerTypes();

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <SettingsTabs />
      <div className="mb-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Klanttypes</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer de klanttypes die beschikbaar zijn in klantprofielen.
        </p>
      </div>

      <div className="max-w-3xl">
        <CustomerTypesManager
          initialTypes={customerTypes}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
