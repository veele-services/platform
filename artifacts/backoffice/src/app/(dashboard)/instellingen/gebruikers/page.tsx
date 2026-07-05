import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listUsersWithRoles, listRoles } from "@/app/actions/settings";
import { GebruikersView } from "@/components/settings/GebruikersView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Gebruikers" };

export default async function GebruikersPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("users", "read"),
    hasPermission("users", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="gebruikers" action="read" />;

  const [users, roles] = await Promise.all([
    listUsersWithRoles(),
    listRoles(),
  ]);

  return (
    <SettingsSectionShell
      title="Gebruikers"
      description={`${users.length} ${users.length === 1 ? "gebruiker" : "gebruikers"} - beheer toegang tot het platform.`}
    >
      <GebruikersView users={users} roles={roles} canWrite={canWrite} />
    </SettingsSectionShell>
  );
}
