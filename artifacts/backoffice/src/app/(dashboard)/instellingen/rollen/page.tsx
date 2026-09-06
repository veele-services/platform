import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getTenantRolePlanCapabilities, listTenantRoles } from "@/app/actions/tenant-roles";
import { RollenView } from "@/components/settings/RollenView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Rollen & rechten" };

export default async function RollenPage() {
  const [canRead, canWrite, canDelete] = await Promise.all([
    hasPermission("roles", "read"),
    hasPermission("roles", "write"),
    hasPermission("roles", "delete"),
  ]);

  if (!canRead) return <ForbiddenPage resource="rollen" action="read" />;

  const [roles, capabilities] = await Promise.all([listTenantRoles(), getTenantRolePlanCapabilities()]);

  return (
    <SettingsSectionShell
      title="Rollen & rechten"
      description={`${roles.length} ${roles.length === 1 ? "rol" : "rollen"} - klik op een rol om de permissie-matrix te bewerken.`}
    >
      <RollenView roles={roles} canWrite={canWrite} canDelete={canDelete} capabilities={capabilities} />
    </SettingsSectionShell>
  );
}
