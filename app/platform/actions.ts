"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { validateTemplateDraft, type TemplateKey } from "@/lib/communications/templates";
import { requirePlatformAdmin } from "@/lib/platform/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantAppUrl } from "@/lib/tenancy/hostname";

const moduleId = z.enum(["planning", "personeel", "rapportage", "finance"]);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const optionalEmail = z.string().trim().email().or(z.literal(""));
const optionalDomain = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/).or(z.literal(""));

const onboardingSchema = z.object({
  requestKey: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  domain: optionalDomain,
  adminName: z.string().trim().min(2).max(160),
  adminEmail: z.string().trim().email(),
  primaryColor: color,
  accentColor: color,
  enabledServices: z.array(moduleId).max(4),
  senderEmail: optionalEmail,
});

export type PlatformMutationResult<T extends object = object> = ActionResult<T & { warning?: string }>;

async function existingUserIdByEmail(email: string) {
  const admin = createAdminClient();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function inviteTenantAdministrator(tenantId: string, slug: string, name: string, email: string) {
  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: tenantAppUrl(slug, "/auth/confirm"),
    data: { full_name: name },
  });
  const userId = invited.user?.id ?? await existingUserIdByEmail(email);
  if (!userId) throw inviteError ?? new Error("De tenantbeheerder kon niet worden uitgenodigd.");
  const { error: membershipError } = await admin.from("tenant_memberships").upsert({
    tenant_id: tenantId,
    user_id: userId,
    roles: ["tenant_admin", "management"],
    status: "active",
    activated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,user_id" });
  if (membershipError) throw membershipError;
  const { error: invitationError } = await admin.from("tenant_admin_invitations").update({
    status: "invited",
    auth_user_id: userId,
    invited_at: new Date().toISOString(),
    last_error: null,
  }).eq("tenant_id", tenantId).eq("email", email.toLowerCase());
  if (invitationError) throw invitationError;
}

export async function createPlatformTenant(input: unknown): Promise<PlatformMutationResult<{ tenantId: string }>> {
  try {
    const context = await requirePlatformAdmin();
    const data = onboardingSchema.parse(input);
    const services = [...new Set(data.enabledServices)];
    if (services.includes("finance") && (!services.includes("planning") || !services.includes("rapportage"))) {
      throw new Error("Facturatie vereist Planning en Rapportage.");
    }
    if (services.includes("rapportage") && !services.includes("planning")) throw new Error("Rapportage vereist Planning.");
    const admin = createAdminClient();
    const { data: tenantId, error } = await admin.rpc("provision_platform_tenant", {
      tenant_name: data.name,
      tenant_slug: data.slug,
      actor_user_id: context.user.id,
      request_key: data.requestKey,
      primary_color: data.primaryColor.toUpperCase(),
      accent_color: data.accentColor.toUpperCase(),
      enabled_services: services,
      admin_name: data.adminName,
      admin_email: data.adminEmail.toLowerCase(),
      tenant_domain: data.domain || undefined,
      sender_email: data.senderEmail || undefined,
    });
    if (error || !tenantId) throw error ?? new Error("Tenantprovisioning gaf geen tenant-ID terug.");
    let warning: string | undefined;
    if (data.adminEmail.toLowerCase() === context.user.email?.toLowerCase()) {
      const [{ error: membershipError }, { error: invitationError }] = await Promise.all([
        admin.from("tenant_memberships").upsert({
          tenant_id: tenantId,
          user_id: context.user.id,
          roles: ["tenant_admin", "management"],
          status: "active",
          activated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,user_id" }),
        admin.from("tenant_admin_invitations").update({
          status: "active",
          auth_user_id: context.user.id,
          invited_at: new Date().toISOString(),
          last_error: null,
        }).eq("tenant_id", tenantId),
      ]);
      if (membershipError || invitationError) throw membershipError ?? invitationError;
    } else {
      try {
        await inviteTenantAdministrator(tenantId, data.slug, data.adminName, data.adminEmail.toLowerCase());
      } catch (cause) {
        const invitationError = message(cause);
        await admin.from("tenant_admin_invitations").update({ status: "failed", last_error: invitationError.slice(0, 1000) }).eq("tenant_id", tenantId);
        warning = "De tenant is veilig aangemaakt, maar de beheerdersuitnodiging moet opnieuw worden verstuurd.";
      }
    }
    revalidatePath("/platform");
    return { ok: true, tenantId, warning };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function retryTenantAdminInvitation(tenantIdInput: unknown): Promise<PlatformMutationResult> {
  try {
    await requirePlatformAdmin();
    const tenantId = z.string().uuid().parse(tenantIdInput);
    const admin = createAdminClient();
    const [{ data: tenant, error: tenantError }, { data: invitation, error: invitationError }] = await Promise.all([
      admin.from("tenants").select("slug").eq("id", tenantId).single(),
      admin.from("tenant_admin_invitations").select("full_name,email").eq("tenant_id", tenantId).single(),
    ]);
    if (tenantError || invitationError) throw tenantError ?? invitationError;
    await inviteTenantAdministrator(tenantId, tenant.slug, invitation.full_name, invitation.email);
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updatePlatformTenantBranding(input: unknown): Promise<PlatformMutationResult> {
  try {
    const context = await requirePlatformAdmin();
    const data = z.object({ tenantId: z.string().uuid(), primaryColor: color, accentColor: color }).parse(input);
    const admin = createAdminClient();
    const { error } = await admin.from("tenant_branding").update({
      primary_color: data.primaryColor.toUpperCase(),
      accent_color: data.accentColor.toUpperCase(),
    }).eq("tenant_id", data.tenantId);
    if (error) throw error;
    await admin.from("audit_events").insert({ tenant_id: data.tenantId, actor_user_id: context.user.id, action: "tenant.branding.updated", entity_type: "tenant_branding", entity_id: data.tenantId, after_data: { primary_color: data.primaryColor.toUpperCase(), accent_color: data.accentColor.toUpperCase() } });
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updatePlatformTenantWhiteLabel(input: unknown): Promise<PlatformMutationResult> {
  try {
    const context = await requirePlatformAdmin();
    const data = z.object({ tenantId: z.string().uuid(), enabled: z.boolean() }).parse(input);
    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.from("tenant_settings").select("white_label_enabled").eq("tenant_id", data.tenantId).single();
    if (currentError) throw currentError;
    const { error } = await admin.from("tenant_settings").update({ white_label_enabled: data.enabled }).eq("tenant_id", data.tenantId);
    if (error) throw error;
    await admin.from("audit_events").insert({
      tenant_id: data.tenantId,
      actor_user_id: context.user.id,
      action: "tenant.whitelabel.updated",
      entity_type: "tenant_settings",
      entity_id: data.tenantId,
      before_data: { white_label_enabled: current.white_label_enabled },
      after_data: { white_label_enabled: data.enabled },
    });
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function uploadPlatformTenantLogo(formData: FormData): Promise<PlatformMutationResult<{ logoUrl: string }>> {
  try {
    const context = await requirePlatformAdmin();
    const tenantId = z.string().uuid().parse(formData.get("tenantId"));
    const file = formData.get("logo");
    if (!(file instanceof File) || !file.size) throw new Error("Selecteer een logo.");
    const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
    const extension = extensions[file.type as keyof typeof extensions];
    if (!extension || file.size > 2 * 1024 * 1024) throw new Error("Gebruik PNG, JPG of WebP van maximaal 2 MB.");
    const admin = createAdminClient();
    const path = `${tenantId}/logo.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("branding").upload(path, bytes, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;
    const { error } = await admin.from("tenant_branding").update({ logo_path: path }).eq("tenant_id", tenantId);
    if (error) throw error;
    await admin.from("audit_events").insert({ tenant_id: tenantId, actor_user_id: context.user.id, action: "tenant.logo.updated", entity_type: "tenant_branding", entity_id: tenantId, after_data: { storage_path: path, mime_type: file.type, size_bytes: file.size } });
    revalidatePath("/platform");
    return { ok: true, logoUrl: `/api/branding/${tenantId}/email-logo` };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updatePlatformTenantModules(input: unknown): Promise<PlatformMutationResult> {
  try {
    const context = await requirePlatformAdmin();
    const data = z.object({ tenantId: z.string().uuid(), enabledServices: z.array(moduleId).max(4) }).parse(input);
    const services = [...new Set(data.enabledServices)];
    if (services.includes("finance") && (!services.includes("planning") || !services.includes("rapportage"))) throw new Error("Facturatie vereist Planning en Rapportage.");
    if (services.includes("rapportage") && !services.includes("planning")) throw new Error("Rapportage vereist Planning.");
    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.from("tenant_settings").select("enabled_services").eq("tenant_id", data.tenantId).single();
    if (currentError) throw currentError;
    const disabling = current.enabled_services.filter((service) => !services.includes(service as z.infer<typeof moduleId>));
    if (disabling.includes("finance")) {
      const { count, error } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenantId).in("status", ["final", "sent", "partially_paid", "overdue"]);
      if (error) throw error;
      if (count) throw new Error("Facturatie kan niet uit zolang er openstaande definitieve facturen zijn.");
    }
    if (disabling.includes("planning")) {
      const { count, error } = await admin.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenantId).not("status", "in", "(invoiced,cancelled)");
      if (error) throw error;
      if (count) throw new Error("Planning kan niet uit zolang er actieve werkbonnen zijn.");
    }
    const { error } = await admin.from("tenant_settings").update({ enabled_services: services }).eq("tenant_id", data.tenantId);
    if (error) throw error;
    await admin.from("audit_events").insert({ tenant_id: data.tenantId, actor_user_id: context.user.id, action: "tenant.modules.updated", entity_type: "tenant_settings", entity_id: data.tenantId, before_data: { enabled_services: current.enabled_services }, after_data: { enabled_services: services } });
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updatePlatformTenantCommunication(input: unknown): Promise<PlatformMutationResult> {
  try {
    const context = await requirePlatformAdmin();
    const data = z.object({ tenantId: z.string().uuid(), senderName: z.string().trim().min(2).max(120), senderEmail: optionalEmail }).parse(input);
    const admin = createAdminClient();
    const { error } = await admin.from("tenant_branding").update({ sender_name: data.senderName, sender_email: data.senderEmail || null }).eq("tenant_id", data.tenantId);
    if (error) throw error;
    await admin.from("audit_events").insert({ tenant_id: data.tenantId, actor_user_id: context.user.id, action: "tenant.communication.updated", entity_type: "tenant_branding", entity_id: data.tenantId, after_data: { sender_name: data.senderName, sender_email: data.senderEmail || null } });
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function savePlatformTemplate(input: unknown): Promise<PlatformMutationResult<{ revision: number }>> {
  try {
    const context = await requirePlatformAdmin();
    const data = z.object({ tenantId: z.string().uuid(), key: z.enum(["invoice", "quote", "workorder", "schedule"]), subject: z.string(), body: z.string(), reset: z.boolean().default(false) }).parse(input);
    if (!data.reset) {
      const validationError = validateTemplateDraft(data.key as TemplateKey, data.subject, data.body);
      if (validationError) throw new Error(validationError);
    }
    const admin = createAdminClient();
    const { data: template, error } = await admin.rpc("save_tenant_message_template", {
      target_tenant_id: data.tenantId,
      target_template_key: data.key,
      target_subject: data.subject,
      target_body: data.body,
      reset_to_default: data.reset,
      actor_user_id: context.user.id,
    });
    if (error || !template) throw error ?? new Error("Template kon niet worden opgeslagen.");
    revalidatePath("/platform");
    return { ok: true, revision: template.revision };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
