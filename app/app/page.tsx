import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { NoAccess } from "./no-access";

export default async function BackofficePage() {
  const context = await getAuthContext();
  if (!context.tenant) {
    if (context.isPlatformAdmin) redirect("/platform");
    return <NoAccess email={context.user.email} />;
  }
  if (context.tenant.roles.length === 1 && context.tenant.roles[0] === "staff") {
    if (context.tenant.enabledServices.includes("personeel")) redirect("/staff");
    return <NoAccess email={context.user.email} />;
  }
  const data = await getWorkspaceData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant as TenantContext }} data={data} initialView="overzicht" />;
}
