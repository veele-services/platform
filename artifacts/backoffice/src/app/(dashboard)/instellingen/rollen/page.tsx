import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listRoles } from "@/app/actions/settings";
import { RollenView } from "@/components/settings/RollenView";

export const metadata: Metadata = { title: "Rollen & rechten" };

export default async function RollenPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("roles", "read"),
    hasPermission("roles", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="rollen" action="read" />;

  const roles = await listRoles();

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Rollen & rechten</span>
        </div>
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Rollen & rechten
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {roles.length} {roles.length === 1 ? "rol" : "rollen"} — klik op een rol om de permissie-matrix te bewerken.
        </p>
      </div>

      <RollenView roles={roles} canWrite={canWrite} />
    </div>
  );
}
