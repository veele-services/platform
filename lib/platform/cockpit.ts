import type { PlatformTenant } from "./data";

export type PlatformSupportSummary = { open: number; needsReply: number; unassigned: number; overdue: number };

/** Summaries use platform configuration only; tenant operational records stay private. */
export function platformConfigurationSummary(tenants: Array<Pick<PlatformTenant, "status" | "staffCount" | "invitationStatus" | "enabledServices" | "templates">>) {
  return {
    totalTenants: tenants.length,
    activeTenants: tenants.filter(tenant => tenant.status === "active").length,
    suspendedTenants: tenants.filter(tenant => tenant.status === "suspended").length,
    activePersonnel: tenants.reduce((total, tenant) => total + tenant.staffCount, 0),
    pendingInvitations: tenants.filter(tenant => tenant.invitationStatus === "pending").length,
    failedInvitations: tenants.filter(tenant => tenant.invitationStatus === "failed").length,
    customerPortals: tenants.filter(tenant => tenant.status === "active" && tenant.enabledServices.includes("klantportaal")).length,
    customizedTemplates: tenants.reduce((total, tenant) => total + tenant.templates.filter(template => template.customized).length, 0),
  };
}
