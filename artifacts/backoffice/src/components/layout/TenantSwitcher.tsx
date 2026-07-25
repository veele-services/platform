"use client";

import { useTransition } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { switchBackofficeTenant } from "@/app/actions/tenant-switcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BackofficeTenantOption } from "@/lib/auth/tenant";
import { cn } from "@/lib/utils";

type TenantSwitcherProps = {
  currentTenantId: string;
  tenants: BackofficeTenantOption[];
  className?: string;
};

export function TenantSwitcher({
  currentTenantId,
  tenants,
  className,
}: TenantSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (tenants.length <= 1) return null;

  return (
    <Select
      defaultValue={currentTenantId}
      disabled={isPending}
      onValueChange={(tenantId) => {
        if (tenantId === currentTenantId) return;
        const formData = new FormData();
        formData.set("tenantId", tenantId);
        startTransition(async () => {
          await switchBackofficeTenant(formData);
        });
      }}
    >
      <SelectTrigger
        className={cn(
          "h-11 w-11 min-w-11 gap-2 px-0 sm:w-auto sm:max-w-[15rem] sm:px-3",
          className,
        )}
        aria-label="Organisatie kiezen"
      >
        {isPending ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        ) : (
          <Building2 className="size-4 shrink-0" />
        )}
        <SelectValue className="hidden truncate sm:block" />
      </SelectTrigger>
      <SelectContent align="end">
        {tenants.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            {tenant.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
