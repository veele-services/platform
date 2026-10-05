import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { personnelThemeStyle } from "@/lib/staff/theme";
import { StaffRouteShellClient } from "./route-shell-client";

type StaffRoute = "tickets" | "notifications";

export async function StaffRouteShell({ active, children }: { active: StaffRoute; children: ReactNode }) {
  const context = await getAuthContext();
  if (!context.tenant) return children;
  return <StaffRouteShellClient
    active={active}
    actorKey={`${context.tenant.id}:${context.user.id}`}
    name="Medewerker"
    style={personnelThemeStyle()}
    tenantId={context.tenant.id}
    ticketsEnabled={context.tenant.enabledServices.includes("tickets")}
  >{children}</StaffRouteShellClient>;
}
