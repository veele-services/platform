import * as React from "react";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";

type SettingsSectionShellSize = "default" | "wide";

export function SettingsSectionShell({
  title,
  description,
  children,
  actions,
  size = "wide",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  size?: SettingsSectionShellSize;
}) {
  return (
    <TenantPageShell size={size}>
      <TenantPageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Instellingen", href: "/settings" }, { label: title }]}
        actions={actions}
      />
      <SettingsTabs />
      {children}
    </TenantPageShell>
  );
}
