import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { NoAccess } from "./no-access";
import { ProvisionForm } from "./provision-form";

export default async function BackofficePage() {
  const context = await getAuthContext();
  if (!context.tenant) {
    return context.isPlatformAdmin ? <ProvisionForm email={context.user.email} /> : <NoAccess email={context.user.email} />;
  }
  if (context.tenant.roles.length === 1 && context.tenant.roles[0] === "staff") redirect("/staff");
  const data = await getWorkspaceData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant as TenantContext }} data={data} />;
}
