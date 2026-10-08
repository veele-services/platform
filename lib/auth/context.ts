import "server-only";

import { cookies, headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { hasManagementPermission, permissionForPath, managementTransferSchema, managementContextSchema } from "@/lib/management/model";
import { managementRpc } from "@/lib/management/rpc";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  roles: AppRole[];
  primaryColor: string;
  accentColor: string;
  logoPath: string | null;
  whiteLabelEnabled: boolean;
  enabledServices: string[];
  permissions?: string[] | null;
  managementRole?: string | null;
  managementDisplayName?: string | null;
  ownershipTransfer?: { id: string; expiresAt: string; sourceName: string } | null;
};

export type AuthContext = {
  user: { id: string; email: string | null; displayName?: string | null };
  tenant: TenantContext | null;
  memberships: Array<{ tenantId: string; tenantName: string; tenantSlug: string; roles: AppRole[] }>;
  isPlatformAdmin: boolean;
};

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const [{ data: membershipRows, error: membershipError }, { data: platformAdmin }] = await Promise.all([
    supabase.from("tenant_memberships").select("tenant_id,roles,status").eq("user_id", user.id).eq("status", "active"),
    supabase.from("platform_admins").select("user_id").maybeSingle(),
  ]);
  if (membershipError) throw membershipError;
  const tenantIds = membershipRows.map((row) => row.tenant_id);
  const { data: tenants, error: tenantsError } = tenantIds.length
    ? await supabase.from("tenants").select("id,name,slug,timezone").in("id", tenantIds).eq("status", "active")
    : { data: [], error: null };
  if (tenantsError) throw tenantsError;

  const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
  const memberships = membershipRows.flatMap((membership) => {
    const tenant = tenantById.get(membership.tenant_id);
    return tenant ? [{ tenantId: tenant.id, tenantName: tenant.name, tenantSlug: tenant.slug, roles: membership.roles }] : [];
  });
  const requestHeaders = await headers();
  const requestedSlug = requestHeaders.get(TENANT_SLUG_HEADER);
  const deployTarget = process.env.DEPLOY_TARGET ?? "local";
  const cookieStore = await cookies();
  const requestedId = deployTarget === "local" ? cookieStore.get("fieldgrid_tenant_id")?.value : undefined;
  const chosen = requestedSlug
    ? memberships.find((membership) => membership.tenantSlug === requestedSlug)
    : deployTarget === "local"
      ? memberships.find((membership) => membership.tenantId === requestedId) ?? memberships[0]
      : undefined;
  let tenant: TenantContext | null = null;
  if (chosen) {
    const { data: resolved, error } = await supabase.rpc("resolve_tenant_context", {
      requested_tenant_id: chosen.tenantId,
      requested_host: undefined,
    }).maybeSingle();
    if (error) throw error;
    if (resolved) {
      const [managementResult, transferResult] = await Promise.all([managementRpc(supabase, "management_context", { target_tenant: resolved.tenant_id }), managementRpc(supabase, "management_pending_transfer", { target_tenant: resolved.tenant_id })]);
      const management = managementContextSchema.parse(managementResult);
      tenant = {
        id: resolved.tenant_id,
        slug: resolved.tenant_slug,
        name: resolved.tenant_name,
        timezone: resolved.timezone,
        roles: resolved.roles,
        primaryColor: resolved.primary_color,
        accentColor: resolved.accent_color,
        logoPath: resolved.logo_path,
        whiteLabelEnabled: resolved.white_label_enabled,
        enabledServices: resolved.enabled_services,
        permissions: management.permissions,
        managementRole: management.role,
        managementDisplayName: management.displayName,
        ownershipTransfer: managementTransferSchema.parse(transferResult),
      };
    }
  }
  // Page components call this live resolver on every navigation; layout reuse
  // cannot preserve an old authorization decision. API/actions also enforce
  // their specific capability at the DB/server mutation boundary.
  const requestedPermission = permissionForPath(requestHeaders.get("x-fieldgrid-pathname") ?? "");
  if (tenant && requestedPermission && (!hasManagementPermission(tenant, "backoffice.access") || !hasManagementPermission(tenant, requestedPermission))) notFound();
  return {
    user: { id: user.id, email: user.email ?? null, displayName: tenant?.managementDisplayName ?? (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim().slice(0, 160) || null : null) },
    tenant,
    memberships,
    isPlatformAdmin: Boolean(platformAdmin),
  };
}

export function hasAnyRole(context: AuthContext, roles: AppRole[]): boolean {
  return Boolean(context.tenant?.roles.some((role) => roles.includes(role)));
}

export function hasService(context: AuthContext, service: string): boolean {
  return Boolean(context.tenant?.enabledServices.includes(service));
}
