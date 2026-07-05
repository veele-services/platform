import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getRole, getRolePlanCapabilities } from "@/app/actions/settings";
import { RolDetailView } from "@/components/settings/RolDetailView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

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
  const [role, capabilities] = await Promise.all([getRole(id), getRolePlanCapabilities()]);
  if (!role) notFound();

  return (
    <SettingsSectionShell
      title={role.name}
      description={role.description ?? (role.isSystem ? "Systeemrol met centraal beheerde permissies." : "Custom rol en permissie-matrix.")}
    >
      <RolDetailView role={role} canWrite={canWrite} capabilities={capabilities} />
    </SettingsSectionShell>
  );
}
