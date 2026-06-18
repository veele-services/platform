import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listUsersWithRoles, listRoles } from "@/app/actions/settings";
import { GebruikersView } from "@/components/settings/GebruikersView";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

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
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <SettingsTabs />
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Gebruikers</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {users.length} {users.length === 1 ? "gebruiker" : "gebruikers"} — beheer toegang tot het platform.
        </p>
      </div>

      <GebruikersView users={users} roles={roles} canWrite={canWrite} />
    </div>
  );
}
