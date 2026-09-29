import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { getWorkspaceData } from "@/lib/data/workspace";
import { StaffApp } from "@/components/fieldgrid/staff-app";

export default async function StaffPage() {
  const context = await getAuthContext();
  if (!context.tenant) redirect("/app");
  if (!context.tenant.enabledServices.includes("personeel")) redirect("/app");
  if (!context.tenant.roles.includes("staff")) redirect("/app");
  const data = await getWorkspaceData(context.tenant.id);
  const personnel = data.personnel.find((item) => item.user_id === context.user.id);
  return <StaffApp context={{ ...context, tenant: context.tenant as TenantContext }} data={data} personnel={personnel ?? null}/>;
}
