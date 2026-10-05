"use server";
import { uploadScannedFile } from "@/lib/files/scanned-storage";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { validateTemplateDraft, type TemplateKey } from "@/lib/communications/templates";
import { requirePlatformAdmin } from "@/lib/platform/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { tenantAppUrl } from "@/lib/tenancy/hostname";

const moduleId = z.enum(["planning", "personeel", "rapportage", "finance", "tickets"]);
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
  enabledServices: z.array(moduleId).max(5),
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

async function inviteTenantAdministrator(tenantId: string, actor: { id: string; email: string | null }) {
  const admin = createAdminClient();
  const [{ data: tenant, error: tenantError }, { data: invitation, error: invitationError }] = await Promise.all([
    admin.from("tenants").select("slug,status").eq("id", tenantId).single(),
    admin.from("tenant_admin_invitations").select("id,full_name,email,status,bound_at").eq("tenant_id", tenantId).single(),
  ]);
  if (tenantError || invitationError) throw tenantError ?? invitationError;
  if (tenant.status !== "active") throw new Error("De tenant is niet actief.");
  // An exact request replay may return the tenant, but never recreate its
  // original administrator after the tenant has changed/revoked membership.
  if (invitation.bound_at || ["invited", "active"].includes(invitation.status)) return;
  try {
    let userId: string | null = actor.email?.toLowerCase() === invitation.email ? actor.id : null;
    if (!userId) {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
        redirectTo: tenantAppUrl(tenant.slug, "/auth/verify"),
        data: { full_name: invitation.full_name },
      });
      userId = invited.user?.id ?? await existingUserIdByEmail(invitation.email);
      if (!userId) throw inviteError ?? new Error("De tenantbeheerder kon niet worden uitgenodigd.");
    }
    const { error } = await admin.rpc("complete_platform_admin_invitation", {
      target_tenant: tenantId, actor_user_id: actor.id, target_user: userId,
    });
    if (error) throw error;
  } catch (cause) {
    // A delayed failed attempt cannot overwrite a concurrently completed one.
    await admin.from("tenant_admin_invitations").update({ status: "failed", last_error: message(cause).slice(0, 1000) })
      .eq("id", invitation.id).is("bound_at", null).in("status", ["pending", "failed"]);
    throw cause;
  }
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
    try {
      await inviteTenantAdministrator(tenantId, context.user);
    } catch {
      warning = "De tenant is veilig aangemaakt, maar de beheerdersuitnodiging is nog niet afgerond. Controleer de foutmelding en probeer opnieuw.";
    }
    revalidatePath("/platform");
    return { ok: true, tenantId, warning };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function retryTenantAdminInvitation(tenantIdInput: unknown): Promise<PlatformMutationResult> {
  try {
    const context = await requirePlatformAdmin();
    const tenantId = z.string().uuid().parse(tenantIdInput);
    await inviteTenantAdministrator(tenantId, context.user);
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
    const path = `${tenantId}/logo-${crypto.randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await uploadScannedFile(await createClient(), "branding", path, bytes, file.type);
    const currentContext = await requirePlatformAdmin();
    if (currentContext.user.id !== context.user.id) throw new Error("Je platformtoegang is gewijzigd. Het logo is niet gekoppeld.");
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
    const data = z.object({ tenantId: z.string().uuid(), enabledServices: z.array(moduleId).max(5) }).parse(input);
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
