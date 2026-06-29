"use client";

import { useTransition } from "react";
import { Building2 } from "lucide-react";
import { switchBackofficeTenant } from "@/app/actions/tenant-switcher";
import type { BackofficeTenantOption } from "@/lib/auth/tenant";

type TenantSwitcherProps = {
  currentTenantId: string;
  tenants: BackofficeTenantOption[];
};

export function TenantSwitcher({ currentTenantId, tenants }: TenantSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (tenants.length <= 1) return null;

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await switchBackofficeTenant(formData);
        });
      }}
      className="hidden items-center gap-2 rounded-md border bg-white px-3 py-2 md:flex"
      style={{ borderColor: "#E2E8F0" }}
    >
      <Building2 className="h-4 w-4 shrink-0" style={{ color: "#64748B" }} />
      <label className="sr-only" htmlFor="tenant-switcher">
        Tenant kiezen
      </label>
      <select
        id="tenant-switcher"
        name="tenantId"
        defaultValue={currentTenantId}
        disabled={isPending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="max-w-[220px] bg-transparent text-sm font-medium outline-none disabled:opacity-60"
        style={{ color: "#081D3A" }}
      >
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
    </form>
  );
}
