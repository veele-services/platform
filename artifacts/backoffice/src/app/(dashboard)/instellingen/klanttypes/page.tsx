import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAllCustomerTypes } from "@/app/actions/customers";
import { CustomerTypesManager } from "@/components/settings/CustomerTypesManager";

export const metadata: Metadata = { title: "Klanttypes" };

export default async function KlanttypesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const customerTypes = await listAllCustomerTypes();

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Klanttypes</span>
        </div>
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Klanttypes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer de klanttypes die beschikbaar zijn in klantprofielen.
        </p>
      </div>

      <CustomerTypesManager
        initialTypes={customerTypes}
        canWrite={canWrite}
      />
    </div>
  );
}
