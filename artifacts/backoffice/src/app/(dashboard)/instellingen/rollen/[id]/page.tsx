import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getRole } from "@/app/actions/settings";
import { RolDetailView } from "@/components/settings/RolDetailView";

export const metadata: Metadata = { title: "Rol bewerken" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RolDetailPage({ params }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("roles", "read"),
    hasPermission("roles", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="rollen" action="read" />;

  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <a href="/instellingen/rollen" className="hover:underline">Rollen & rechten</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>{role.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
            {role.name}
          </h1>
          {role.isSystem && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#E0FAFB", color: "#00B7B3" }}
            >
              Systeemrol
            </span>
          )}
        </div>
        {role.description && (
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            {role.description}
          </p>
        )}
      </div>

      <RolDetailView role={role} canWrite={canWrite} />
    </div>
  );
}
