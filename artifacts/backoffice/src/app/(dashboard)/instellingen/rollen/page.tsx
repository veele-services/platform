import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getRolePlanCapabilities, listRoles } from "@/app/actions/settings";
import { RollenView } from "@/components/settings/RollenView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Rollen & rechten" };

export default async function RollenPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("roles", "read"),
    hasPermission("roles", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="rollen" action="read" />;

  const [roles, capabilities] = await Promise.all([listRoles(), getRolePlanCapabilities()]);

  return (
    <SettingsSectionShell
      title="Rollen & rechten"
      description={`${roles.length} ${roles.length === 1 ? "rol" : "rollen"} - klik op een rol om de permissie-matrix te bewerken.`}
    >
      <RollenView roles={roles} canWrite={canWrite} capabilities={capabilities} />
    </SettingsSectionShell>
  );
}
