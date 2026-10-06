import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { createClient } from "@/lib/supabase/server";
import { TenantThemeProvider } from "../tenant-theme";
import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { personnelThemeStyle } from "@/lib/staff/theme";
import { StaffRouteShellClient } from "./route-shell-client";

type StaffRoute = "tickets" | "notifications";

export async function StaffRouteShell({ active, children }: { active: StaffRoute; children: ReactNode }) {
  const context = await getAuthContext();
  if (!context.tenant) return children;
  const logo = await getBrandingLogoUrl(await createClient(), context.tenant.logoPath);
  return <TenantThemeProvider primary={context.tenant.primaryColor} accent={context.tenant.accentColor}><StaffRouteShellClient
    active={active}
    actorKey={`${context.tenant.id}:${context.user.id}`}
    name="Medewerker"
    tenantName={context.tenant.name}
    logoUrl={logo}
    whiteLabel={context.tenant.whiteLabelEnabled}
    style={personnelThemeStyle(context.tenant.primaryColor,context.tenant.accentColor)}
    tenantId={context.tenant.id}
    ticketsEnabled={context.tenant.enabledServices.includes("tickets")}
  >{children}</StaffRouteShellClient></TenantThemeProvider>;
}
