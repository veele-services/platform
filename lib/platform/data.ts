import "server-only";

import { getAuthContext } from "@/lib/auth/context";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import type { TemplateChannel, TemplateKey } from "@/lib/communications/templates";
import { getTicketAccess, getTicketList } from "@/lib/tickets/data";
import { ticketQuerySchema } from "@/lib/tickets/model";
import type { PlatformSupportSummary } from "./cockpit";
import type { WorkspaceDomain } from "@/lib/tenancy/workspace-domain";

export type PlatformTemplate = {
  key: TemplateKey;
  channel: TemplateChannel;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  revision: number;
  customized: boolean;
};

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  createdAt: string;
  domain: string;
  domainVerified: boolean;
  canonicalHost: string;
  workspaceDomains: WorkspaceDomain[];
  staffCount: number;
  ownerName: string;
  ownerEmail: string;
  invitationStatus: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  senderName: string;
  senderEmail: string;
  whiteLabelEnabled: boolean;
  enabledServices: string[];
  templates: PlatformTemplate[];
};

export type PlatformData = {
  currentUserEmail: string | null;
  currentUserName?: string | null;
  tenants: PlatformTenant[];
  support: PlatformSupportSummary | null;
};

export async function requirePlatformAdmin() {
  const context = await getAuthContext();
  if (!context.isPlatformAdmin) throw new Error("Alleen Fieldgrid-platformbeheer heeft toegang.");
  return context;
}

function assertResult(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getPlatformData(): Promise<PlatformData> {
  const context = await requirePlatformAdmin();
  const admin = createAdminClient();
  // The authenticated ticket RPC counts only explicitly granted support scope.
  // Platform administration alone does not open tenant conversations.
  const supportPromise = getTicketAccess("platform").then(async access => access.allowed
    ? (await getTicketList("platform", ticketQuerySchema.parse({ pageSize: 10 }))).counts
    : null);
  const [tenantsResult, brandingResult, settingsResult, domainsResult, personnelResult, membershipsResult, invitationsResult, templatesResult, workspaceDomainsResult, support] = await Promise.all([
    admin.from("tenants").select("id,name,slug,status,timezone,created_at").order("created_at", { ascending: false }),
    admin.from("tenant_branding").select("tenant_id,primary_color,accent_color,logo_path,sender_name,sender_email"),
    admin.from("tenant_settings").select("tenant_id,enabled_services,white_label_enabled"),
    admin.from("tenant_domains").select("tenant_id,host,verified_at").order("created_at"),
    admin.from("personnel").select("tenant_id,id").eq("status", "active"),
    admin.from("tenant_memberships").select("tenant_id,user_id,roles,status").eq("status", "active").contains("roles", ["tenant_admin"]),
    admin.from("tenant_admin_invitations").select("tenant_id,full_name,email,status,auth_user_id,created_at").order("created_at", { ascending: false }),
    admin.from("tenant_message_templates").select("tenant_id,template_key,channel,subject,body,default_subject,default_body,revision,customized").order("template_key"),
    admin.from("tenant_workspace_domains").select("id,tenant_id,host,environment,status,verification_token,verified_at").eq("environment", process.env.DEPLOY_TARGET ?? "local"),
    supportPromise,
  ]);
  [tenantsResult, brandingResult, settingsResult, domainsResult, personnelResult, membershipsResult, invitationsResult, templatesResult, workspaceDomainsResult].forEach((result) => assertResult(result.error));

  const userIds = [...new Set((membershipsResult.data ?? []).map((item) => item.user_id))];
  const authUsers = new Map<string, { email: string; name: string }>();
  await Promise.all(userIds.map(async (userId) => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data.user) {
      const displayName = typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name.trim() : "";
      authUsers.set(userId, { email: data.user.email ?? "", name: displayName });
    }
  }));

  const tenants = await Promise.all((tenantsResult.data ?? []).map(async (tenant): Promise<PlatformTenant> => {
    const branding = (brandingResult.data ?? []).find((item) => item.tenant_id === tenant.id);
    const settings = (settingsResult.data ?? []).find((item) => item.tenant_id === tenant.id);
    const domain = (domainsResult.data ?? []).find((item) => item.tenant_id === tenant.id && item.verified_at)
      ?? (domainsResult.data ?? []).find((item) => item.tenant_id === tenant.id);
    const membership = (membershipsResult.data ?? []).find((item) => item.tenant_id === tenant.id);
    const invitation = (invitationsResult.data ?? []).find((item) => item.tenant_id === tenant.id);
    const owner = membership ? authUsers.get(membership.user_id) : undefined;
    const templateRows = (templatesResult.data ?? []).filter((item) => item.tenant_id === tenant.id);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      timezone: tenant.timezone,
      createdAt: tenant.created_at,
      domain: domain?.host ?? new URL(tenantAppUrl(tenant.slug)).hostname,
      domainVerified: Boolean(domain?.verified_at),
      canonicalHost: new URL(tenantAppUrl(tenant.slug)).hostname,
      workspaceDomains: (workspaceDomainsResult.data ?? []).filter(item => item.tenant_id === tenant.id).map(item => ({ id: item.id, host: item.host, environment: item.environment, status: item.status as WorkspaceDomain["status"], verificationToken: item.verification_token, verifiedAt: item.verified_at })),
      staffCount: (personnelResult.data ?? []).filter((item) => item.tenant_id === tenant.id).length,
      ownerName: owner?.name || owner?.email || invitation?.full_name || "Nog geen eigenaar",
      ownerEmail: owner?.email || invitation?.email || "",
      invitationStatus: invitation?.status ?? null,
      primaryColor: branding?.primary_color ?? "#222C35",
      accentColor: branding?.accent_color ?? "#41AC42",
      logoUrl: await getBrandingLogoUrl(admin, branding?.logo_path, { absolute: true }),
      senderName: branding?.sender_name ?? tenant.name,
      senderEmail: branding?.sender_email ?? "",
      whiteLabelEnabled: settings?.white_label_enabled ?? false,
      enabledServices: settings?.enabled_services ?? [],
      templates: templateRows.map((template) => ({
        key: template.template_key as TemplateKey,
        channel: template.channel as TemplateChannel,
        subject: template.subject,
        body: template.body,
        defaultSubject: template.default_subject,
        defaultBody: template.default_body,
        revision: template.revision,
        customized: template.customized,
      })),
    };
  }));

  return { currentUserEmail: context.user.email, currentUserName: context.user.displayName, tenants, support };
}
