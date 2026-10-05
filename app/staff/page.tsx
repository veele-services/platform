import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { getWorkspaceData } from "@/lib/data/workspace";
import { PersonnelApp } from "@/components/fieldgrid/staff/personnel-app";
import { StaffProfileRecovery } from "@/components/fieldgrid/staff/profile-recovery";
import { getNotificationPreferences } from "@/lib/notifications/data";

export default async function StaffPage() {
  const context = await getAuthContext();
  if (!context.tenant) redirect("/app");
  if (!context.tenant.enabledServices.includes("personeel")) redirect("/app");
  if (!context.tenant.roles.includes("staff")) redirect("/app");
  const data = await getWorkspaceData(context.tenant.id, "staff");
  // `staff_workspace` is already authenticated and returns at most the current
  // employee. It deliberately omits account identifiers from the browser DTO.
  const personnel = data.personnel[0] ?? null;
  // Notification preferences require an active staff actor too. Keep this
  // check ahead of that RPC so a missing or inactive personnel link reaches a
  // useful recovery state instead of turning into a generic route error.
  if (!personnel) return <StaffProfileRecovery/>;
  const notificationPreferences = await getNotificationPreferences("staff");
  return <PersonnelApp context={{ ...context, tenant: context.tenant as TenantContext }} data={data} personnel={personnel} notificationPreferences={notificationPreferences}/>;
}
