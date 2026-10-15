"use server";

import { requireBackofficePermission } from "@/lib/management/auth";
import { addressFromForm } from "@/lib/addresses/form";
import { mobilityFromForm } from "@/lib/travel/forms";
import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { getAuthContext, hasAnyRole, type AppRole, type AuthContext, type TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadScannedFile } from "@/lib/files/scanned-storage";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { validateDossierDocumentName, CUSTOMER_DOCUMENT_MAX_BYTES, customerDocumentExtension, customerDocumentFileName } from "@/lib/customers/documents";
import { privacyText } from "@/lib/personnel/dossier";
import { personnelNumberInputSchema, personnelNumberSettingsSchema } from "@/lib/personnel/numbering";
import { deliverPersonnelInvitation, preparePersonnelAccount, requirePersonnelEmail } from "@/lib/personnel/invitations";
import { confirmPersonnelInvitationAccess, personnelInvitationActor } from "@/lib/personnel/invitation-access";
import { BRANDING_LOGO_MAX_BYTES, BRANDING_LOGO_MAX_PIXELS, rejectLogoAnimation, validateLogoMetadata } from "@/lib/branding/validation";

async function authorized(roles: AppRole[], services: string[] = []): Promise<AuthContext & { tenant: TenantContext }> {
  const context = await getAuthContext();
  if (!context.tenant || !hasAnyRole(context, roles)) throw new Error("Onvoldoende rechten voor deze actie");
  if (services.some((service) => !context.tenant!.enabledServices.includes(service))) throw new Error("Deze module is niet actief voor de tenant");
  return context as AuthContext & { tenant: TenantContext };
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value : "";
  return text ? z.string().uuid().parse(text) : null;
}

function generatedNumber(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${stamp.slice(-7)}`;
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const schema = z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().email().or(z.literal("")),
      phone: z.string().trim().max(40).optional(),
      street: z.string().trim().min(2).max(200),
      postalCode: z.string().trim().min(4).max(16),
      city: z.string().trim().min(2).max(120),
      paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
      status: z.enum(["lead", "active", "inactive"]).default("active"),
    });
    const input = schema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("customers").insert({
      tenant_id: context.tenant.id, customer_number: generatedNumber("KL"), name: input.name,
      billing_email: input.email || null, phone: input.phone || null,
      billing_address: await addressFromForm(formData, "addressPayload", true),
      payment_terms_days: input.paymentTermsDays, status: input.status,
    });
    if (error) throw error;
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateCustomer(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({
      customerId: z.string().uuid(), version: z.coerce.number().int().positive(),
      name: z.string().trim().min(2).max(160), email: z.string().email().or(z.literal("")),
      phone: z.string().trim().max(40).optional(), street: z.string().trim().min(2).max(200),
      postalCode: z.string().trim().min(4).max(16), city: z.string().trim().min(2).max(120),
      paymentTermsDays: z.coerce.number().int().min(0).max(365), status: z.enum(["lead", "active", "inactive"]),
    }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("customers").update({
      name: input.name, billing_email: input.email || null, phone: input.phone || null,
      billing_address: await addressFromForm(formData, "addressPayload", true),
      payment_terms_days: input.paymentTermsDays, status: input.status, version: input.version + 1,
    }).eq("tenant_id", context.tenant.id).eq("id", input.customerId).eq("version", input.version).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Deze klant is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function archiveCustomer(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management"], ["planning"]);
    const input = z.object({ customerId: z.string().uuid(), version: z.coerce.number().int().positive() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("customers").update({ status: "inactive", version: input.version + 1 })
      .eq("tenant_id", context.tenant.id).eq("id", input.customerId).eq("version", input.version).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Deze klant is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.tasks.write");
    const context = await authorized(["tenant_admin", "management", "planner"], ["planning"]);
    const schema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,31}$/), name: z.string().trim().min(2), discipline: z.string().trim().min(2), duration: z.coerce.number().int().min(1).max(1440), price: z.coerce.number().nonnegative(), vat: z.coerce.number().int().min(0).max(100) });
    const input = schema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: task, error } = await supabase.from("task_catalog").insert({ tenant_id: context.tenant.id, code: input.code, name: input.name, discipline: input.discipline }).select().single();
    if (error) throw error;
    const { error: revisionError } = await supabase.from("task_revisions").insert({ tenant_id: context.tenant.id, task_id: task.id, revision: 1, duration_minutes: input.duration, price_cents: Math.round(input.price * 100), vat_basis_points: input.vat * 100, unit: "task" });
    if (revisionError) {
      await supabase.from("task_catalog").delete().eq("id", task.id);
      throw revisionError;
    }
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createWorkOrder(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.work_orders.write");
    const context = await authorized(["tenant_admin", "management", "planner"], ["planning"]);
    const schema = z.object({ customerId: z.string().uuid(), objectId: z.string().uuid(), personnelId: z.string().uuid(), discipline: z.string().trim().min(2), taskIds: z.string().min(1), start: z.string().min(10), appointmentStart: z.string().optional(), appointmentEnd: z.string().optional(), signatureRequired: z.string().optional() });
    const input = schema.parse(Object.fromEntries(formData));
    const taskIds = input.taskIds.split(",").filter(Boolean).map((value) => z.string().uuid().parse(value));
    if (!taskIds.length) throw new Error("Selecteer minimaal één taak");
    const supabase = await createClient();
    const { data: taskRows, error: taskError } = await supabase.from("task_catalog").select("*").in("id", taskIds).eq("active", true);
    if (taskError || taskRows.length !== taskIds.length) throw taskError ?? new Error("Een geselecteerde taak bestaat niet meer");
    const { data: revisions, error: revisionError } = await supabase.from("task_revisions").select("*").in("task_id", taskIds).is("valid_until", null);
    if (revisionError) throw revisionError;
    const latest = taskIds.map((taskId) => revisions.filter((revision) => revision.task_id === taskId).sort((a, b) => b.revision - a.revision)[0]);
    if (latest.some((revision) => !revision)) throw new Error("Een taak heeft geen actuele tariefversie");
    const duration = latest.reduce((sum, revision) => sum + revision.duration_minutes, 0);
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new Error("Ongeldige starttijd");
    const end = new Date(start.getTime() + duration * 60_000);
    const { data: overlap, error: overlapError } = await supabase.from("work_order_assignments").select("id").eq("personnel_id", input.personnelId).lt("projected_start_at", end.toISOString()).gt("projected_end_at", start.toISOString()).not("status", "in", "(completed,returned,cancelled)").limit(1);
    if (overlapError) throw overlapError;
    if (overlap.length) throw new Error("Deze medewerker heeft al een overlappende opdracht");
    let slotId: string | null = null;
    if (input.appointmentStart && input.appointmentEnd) {
      const { data: slot, error: slotError } = await supabase.from("appointment_slots").insert({ tenant_id: context.tenant.id, starts_at: input.appointmentStart, ends_at: input.appointmentEnd, capacity: 1, booked_count: 1, status: "full" }).select().single();
      if (slotError) throw slotError;
      slotId = slot.id;
    }
    const { data: order, error } = await supabase.from("work_orders").insert({ tenant_id: context.tenant.id, work_order_number: generatedNumber("WB"), customer_id: input.customerId, object_id: input.objectId, appointment_slot_id: slotId, discipline: input.discipline, planned_start_at: start.toISOString(), planned_end_at: end.toISOString(), projected_start_at: start.toISOString(), projected_end_at: end.toISOString(), signature_required: input.signatureRequired === "on", created_by: context.user.id }).select().single();
    if (error) throw error;
    const taskById = new Map(taskRows.map((task) => [task.id, task]));
    const taskPayload = latest.map((revision) => ({ tenant_id: context.tenant!.id, work_order_id: order.id, task_revision_id: revision.id, task_code: taskById.get(revision.task_id)!.code, task_name: taskById.get(revision.task_id)!.name, duration_minutes: revision.duration_minutes, unit: revision.unit, unit_price_cents: revision.price_cents, vat_basis_points: revision.vat_basis_points }));
    const { error: tasksInsertError } = await supabase.from("work_order_tasks").insert(taskPayload);
    if (tasksInsertError) {
      await supabase.from("work_orders").delete().eq("id", order.id);
      throw tasksInsertError;
    }
    const { data: planning, error: assignmentError } = await supabase.rpc("change_work_order_planning", {
      target_tenant: context.tenant.id,
      target_work_order: order.id,
      expected_version: order.version,
      mutation_id: crypto.randomUUID(),
      target_start: start.toISOString(),
      target_end: end.toISOString(),
      target_assignments: [{ personnelId: input.personnelId, start: start.toISOString(), end: end.toISOString() }],
    });
    if (assignmentError) {
      await supabase.from("work_orders").delete().eq("id", order.id);
      throw assignmentError;
    }
    if (!(planning as { ok: boolean }).ok) {
      revalidatePath("/app", "layout");
      return { ok: false, error: "De werkbon is aangemaakt maar nog niet toegewezen. Open het planbord om de planningsafwijkingen te controleren en te bevestigen." };
    }
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function dispatchWorkOrder(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.planning.write");
    await authorized(["tenant_admin", "management", "planner"], ["planning"]);
    const input = z.object({ workOrderId: z.string().uuid(), personnelId: z.string().uuid(), version: z.coerce.number().int() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("dispatch_work_order", { target_work_order_id: input.workOrderId, target_personnel_id: input.personnelId, expected_version: input.version, idempotency_key: `dispatch-${input.workOrderId}-${input.personnelId}-${input.version}` });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function reviewWorkOrder(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.reports.write");
    await authorized(["tenant_admin", "management", "finance"], ["rapportage"]);
    const input = z.object({ workOrderId: z.string().uuid(), decision: z.enum(["approved", "returned"]), reason: z.string().optional() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("review_work_order", { target_work_order_id: input.workOrderId, decision: input.decision, reason: input.reason || undefined });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createAnnouncement(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.news.write");
    const context = await authorized(["tenant_admin", "management"], ["personeel"]);
    const input = z.object({ title: z.string().trim().min(2), body: z.string().trim().min(3), sendPush: z.string().optional() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("announcements").insert({ tenant_id: context.tenant.id, title: input.title, body: input.body, send_push: input.sendPush === "on", audience_roles: ["staff"], created_by: context.user.id }).select().single();
    if (error) throw error;
    const { error: publishError } = await supabase.rpc("publish_announcement", { target_announcement_id: data.id });
    if (publishError) throw publishError;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function suggestPersonnelNumber(): Promise<ActionResult<{ employeeNumber: string }>> {
  try {
    await requireBackofficePermission("backoffice.personnel.read");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("suggest_personnel_number", { target_tenant_id: context.tenant.id });
    if (error) throw new Error(error.message);
    return { ok: true, employeeNumber: data };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updatePersonnelNumberSettings(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.settings.write");
    const context = await authorized(["tenant_admin", "management"], ["personeel"]);
    const input = personnelNumberSettingsSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("tenant_settings").update({
      personnel_number_prefix: input.prefix, personnel_number_start: input.startNumber,
    }).eq("tenant_id", context.tenant.id).select("tenant_id").single();
    if (error || !data) throw new Error(error?.message ?? "De nummering kon niet worden opgeslagen.");
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function invitePersonnel(formData: FormData): Promise<ActionResult<{ employeeNumber: string; warning?: string }>> {
  try {
    const context = await personnelInvitationActor("backoffice.functions.invite_personnel");
    const input = z.object({
      name: z.string().trim().min(2).max(160), email: z.string().trim().email().toLowerCase(),
      phone: z.string().trim().max(40).optional(), startDate: z.string().date().or(z.literal("")),
    }).parse(Object.fromEntries(formData));
    const numbering = personnelNumberInputSchema.parse(Object.fromEntries(formData));
    requirePersonnelEmail();
    const supabase = await createClient();
    // Reject repeat submissions before rotating an outstanding activation link.
    const { data: sameEmail, error: emailLookupError } = await supabase.from("personnel").select("id")
      .eq("tenant_id", context.tenant.id).ilike("email", input.email.replace(/[\\%_]/g, "\\$&")).limit(1);
    if (emailLookupError) throw new Error("De personeelsgegevens konden niet worden gecontroleerd.");
    if (sameEmail?.length) throw new Error("Deze medewerker bestaat al. Gebruik ‘Meer → Uitnodiging opnieuw versturen’ in de personeelslijst.");
    // Validate a manual override before sending an invitation. The unique database
    // constraint remains the final guard if two requests race after this check.
    if (numbering.employeeNumberMode === "manual") {
      const { data: existing, error } = await supabase.from("personnel").select("id")
        .eq("tenant_id", context.tenant.id).eq("employee_number", numbering.employeeNumber).maybeSingle();
      if (error) throw new Error(error.message);
      if (existing) throw new Error("Dit personeelsnummer is al in gebruik. Kies een ander nummer.");
    }
    const mobility = await mobilityFromForm(formData);
    await personnelInvitationActor("backoffice.functions.invite_personnel",context);
    const account = await preparePersonnelAccount(input.email);
    await personnelInvitationActor("backoffice.functions.invite_personnel",context);
    const { data: existingPerson, error: personLookupError } = await supabase.from("personnel").select("id").eq("tenant_id", context.tenant.id).eq("user_id", account.userId).maybeSingle();
    if (personLookupError) throw new Error("De personeelsgegevens konden niet worden gecontroleerd.");
    if (existingPerson) throw new Error("Deze medewerker bestaat al. Gebruik ‘Meer → Uitnodiging opnieuw versturen’ in de personeelslijst.");
    // The authenticated binder only appends staff, checks the exact Auth email,
    // and preserves any existing management profile and compatibility roles.
    const { error: membershipError } = await supabase.rpc("bind_personnel_account" as never,{ target_tenant: context.tenant.id, expected_user: account.userId, expected_email: input.email } as never);
    if (membershipError) throw membershipError;
    const { data: person, error: personnelError } = await supabase.from("personnel").insert({ tenant_id: context.tenant.id, user_id: account.userId, employee_number: numbering.employeeNumberMode === "automatic" ? "" : numbering.employeeNumber, full_name: input.name, email: input.email, mobile_phone: input.phone || null, start_date: input.startDate || null, ...mobility }).select("id,employee_number").single();
    if (personnelError) throw new Error(personnelError.code === "23505" ? "Deze medewerker of dit personeelsnummer bestaat al. Controleer de personeelslijst." : personnelError.message);
    revalidatePath("/app", "layout");
    try {
      const delivery = await deliverPersonnelInvitation({ tenant: context.tenant, person: { ...person, userId: account.userId, email: input.email, full_name: input.name }, tokenHash: account.tokenHash, confirmAccess: () => confirmPersonnelInvitationAccess(context,"backoffice.functions.invite_personnel",{ id: person.id, userId: account.userId, email: input.email }) });
      return { ok: true, employeeNumber: person.employee_number, ...delivery };
    } catch (error) {
      return { ok: true, employeeNumber: person.employee_number, warning: `De medewerker is aangemaakt. ${message(error)}` };
    }
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function repeatPersonnelInvitation(formData: FormData): Promise<ActionResult<{ warning?: string }>> {
  try {
    const context = await personnelInvitationActor("backoffice.functions.repeat_personnel_invitation");
    const personnelId = z.string().uuid().parse(formData.get("personnelId"));
    requirePersonnelEmail();
    const supabase = await createClient();
    const { data: person, error } = await supabase.from("personnel").select("id,user_id,email,full_name,employee_number,status").eq("tenant_id", context.tenant.id).eq("id", personnelId).single();
    if (error || !person.email || !person.user_id || !["invited", "active"].includes(person.status)) throw new Error("Deze medewerker kan niet worden uitgenodigd. Controleer het account, e-mailadres en de status.");
    const recipient = { id: person.id, userId: person.user_id, email: person.email };
    await confirmPersonnelInvitationAccess(context,"backoffice.functions.repeat_personnel_invitation",recipient);
    const account = await preparePersonnelAccount(person.email);
    if (account.userId !== person.user_id) throw new Error("Het account kon niet worden gecontroleerd.");
    const delivery = await deliverPersonnelInvitation({ tenant: context.tenant, person: { ...person, userId: person.user_id, email: person.email }, tokenHash: account.tokenHash, confirmAccess: () => confirmPersonnelInvitationAccess(context,"backoffice.functions.repeat_personnel_invitation",recipient) });
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updatePersonnel(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({
      personnelId: z.string().uuid(), version: z.coerce.number().int().positive(),
      name: z.string().trim().min(2).max(160), email: z.string().email().or(z.literal("")),
      employeeNumber: z.string().trim().min(1).max(80), phone: z.string().trim().max(40).optional(),
      startDate: z.string().date().or(z.literal("")), status: z.enum(["invited", "active", "inactive", "former"]),
    }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("personnel").update({
      full_name: input.name, email: input.email || null, employee_number: input.employeeNumber,
      phone: input.phone || null, start_date: input.startDate || null, status: input.status, version: input.version + 1,
    }).eq("tenant_id", context.tenant.id).eq("id", input.personnelId).eq("version", input.version).select("id").maybeSingle();
    if (error) throw new Error(error.code === "23505" ? "Dit personeelsnummer is al in gebruik. Kies een ander nummer." : error.message);
    if (!data) throw new Error("Deze medewerker is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function archivePersonnel(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({ personnelId: z.string().uuid(), version: z.coerce.number().int().positive() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.from("personnel").update({ status: "inactive", version: input.version + 1 })
      .eq("tenant_id", context.tenant.id).eq("id", input.personnelId).eq("version", input.version).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Deze medewerker is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateTenantBranding(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.settings.write");
    const context = await authorized(["tenant_admin", "management"]);
    const input = z.object({ primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), senderName: z.string().trim().min(2), senderEmail: z.string().email().or(z.literal("")) }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("tenant_branding").update({ primary_color: input.primaryColor, accent_color: input.accentColor, sender_name: input.senderName, sender_email: input.senderEmail || null }).eq("tenant_id", context.tenant.id);
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function uploadTenantLogo(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.settings.write");
    const context = await authorized(["tenant_admin", "management"]);
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Kies een logo om te uploaden");
    if (file.size > BRANDING_LOGO_MAX_BYTES) throw new Error("Het logo mag maximaal 2 MB zijn");
    const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
    const extension = extensions[file.type];
    if (!extension) throw new Error("Gebruik een PNG-, JPG- of WebP-logo");
    const bytes = new Uint8Array(await file.arrayBuffer());
    rejectLogoAnimation(bytes, file.type);
    const image = sharp(bytes, { limitInputPixels: BRANDING_LOGO_MAX_PIXELS });
    validateLogoMetadata(await image.metadata(), file.type);
    await image.stats(); // Use the same static image bounds as house style and PWA.

    const supabase = await createClient();
    const { error: brandingError } = await supabase.from("tenant_branding").select("logo_path").eq("tenant_id", context.tenant.id).single();
    if (brandingError) throw brandingError;
    const path = `${context.tenant.id}/logo-${crypto.randomUUID()}.${extension}`;
    await uploadScannedFile(supabase, "branding", path, bytes, file.type);
    const { error: updateError } = await supabase.from("tenant_branding").update({ logo_path: path }).eq("tenant_id", context.tenant.id);
    if (updateError) throw updateError;
    // Historical offers, invoices and notification snapshots may still refer to
    // the previous immutable logo. Replacement is not permission to delete it.
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function withdrawAnnouncement(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.news.write");
    await authorized(["tenant_admin", "management"], ["personeel"]);
    const announcementId = z.string().uuid().parse(formData.get("announcementId"));
    const supabase = await createClient();
    const { error } = await supabase.from("announcements").update({ withdrawn_at: new Date().toISOString() }).eq("id", announcementId);
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createOpenShift(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.planning.write");
    const context = await authorized(["tenant_admin", "management", "planner"], ["planning", "personeel"]);
    const input = z.object({ workOrderId: z.string().uuid(), functionId: z.string().uuid(), start: z.string().min(10), end: z.string().min(10) }).parse(Object.fromEntries(formData));
    const start = new Date(input.start); const end = new Date(input.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Ongeldige dienstperiode");
    const supabase = await createClient();
    const { data: job, error: jobError } = await supabase.from("function_catalog").select("required_certificate_codes").eq("id", input.functionId).single();
    if (jobError) throw jobError;
    const { error } = await supabase.from("open_shifts").insert({ tenant_id: context.tenant.id, work_order_id: input.workOrderId, function_id: input.functionId, starts_at: start.toISOString(), ends_at: end.toISOString(), required_certificate_codes: job.required_certificate_codes, created_by: context.user.id });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function setActiveTenant(formData: FormData): Promise<ActionResult> {
  try {
    optionalUuid(formData.get("tenantId"));
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function confirmShiftInterest(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.planning.write");
    await authorized(["tenant_admin", "management", "planner"], ["planning", "personeel"]);
    const input = z.object({ shiftId: z.string().uuid(), personnelId: z.string().uuid() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("confirm_shift_interest", { target_shift_id: input.shiftId, target_personnel_id: input.personnelId });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createCustomerContact(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({ customerId: z.string().uuid(), fullName: z.string().trim().min(2), email: z.string().email().or(z.literal("")), phone: z.string().trim().optional(), role: z.string().trim().optional(), primary: z.string().optional() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("customer_contacts").insert({ tenant_id: context.tenant.id, customer_id: input.customerId, full_name: input.fullName, email: input.email || null, phone: input.phone || null, role: input.role || null, is_primary: input.primary === "on" });
    if (error) throw error;
    revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createCustomerNote(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({ customerId: z.string().uuid(), body: z.string().trim().min(1).max(10000) }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("customer_notes").insert({
      tenant_id: context.tenant.id, customer_id: input.customerId, body: input.body, created_by: context.user.id,
    });
    if (error) throw error;
    revalidatePath("/app/klanten");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function uploadCustomerDocument(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.customers.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({ customerId: z.string().uuid(), title: z.string().trim().min(2).max(160), requestId:z.uuid().optional(), category:z.enum(["agreement","correspondence","report","photo","other"]).default("other"), previousId:z.uuid().or(z.literal("")).optional(), documentOn:z.iso.date().or(z.literal("")).optional(), validUntil:z.iso.date().or(z.literal("")).optional() }).parse(Object.fromEntries(formData));
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecteer een document");
    if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) throw new Error("Gebruik PDF, JPG of PNG van maximaal 10 MB");
    validateDossierDocumentName(input.title,file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = customerDocumentExtension(file.type, bytes);
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase.from("customers").select("id")
      .eq("tenant_id", context.tenant.id).eq("id", input.customerId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Klant niet gevonden binnen deze tenant");
    const path = `${context.tenant.id}/${customer.id}/${randomBytes(16).toString("hex")}.${extension}`;
    const bucket = createAdminClient().storage.from("customer-documents");
    if(input.requestId){
      const existing=await supabase.from("customer_documents").select("id,created_by,customer_id,sha256,title,previous_id").eq("tenant_id",context.tenant.id).eq("id",input.requestId).maybeSingle();
      if(existing.error)throw existing.error;
      if(existing.data){if(existing.data.created_by!==context.user.id||existing.data.customer_id!==customer.id||existing.data.sha256!==createHash("sha256").update(bytes).digest("hex")||existing.data.title!==input.title||existing.data.previous_id!==(input.previousId||null))throw new Error("Deze uploadpoging is al gebruikt. Open een nieuw uploadvenster.");return {ok:true};}
    }
    await uploadScannedFile(supabase, "customer-documents", path, bytes, file.type);
    const { error } = await supabase.from("customer_documents").insert({
      id:input.requestId,category:input.category,tenant_id: context.tenant.id, customer_id: customer.id, title: input.title, storage_path: path, previous_id:input.previousId||null,document_on:input.documentOn||null,valid_until:input.validUntil||null,
      file_name: customerDocumentFileName(file.name), mime_type: file.type, size_bytes: file.size,
      sha256: createHash("sha256").update(bytes).digest("hex"), created_by: context.user.id,
    });
    if (error) {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError) throw new Error("Documentregistratie mislukt; het losse bestand kon niet worden opgeruimd. Neem contact op met de beheerder.");
      throw error;
    }
    revalidatePath("/app/klanten");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createObject(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.objects.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({ customerId: z.string().uuid(), name: z.string().trim().min(2), street: z.string().trim().min(2), postalCode: z.string().trim().min(4), city: z.string().trim().min(2), instructions: z.string().trim().max(2000).optional() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase.from("customers").select("id").eq("tenant_id", context.tenant.id).eq("id", input.customerId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Selecteer een bestaande klant binnen deze tenant");
    const { error } = await supabase.from("objects").insert({ tenant_id: context.tenant.id, customer_id: input.customerId, object_number: generatedNumber("OB"), name: input.name, address: await addressFromForm(formData, "addressPayload", true), access_instructions: input.instructions || null });
    if (error) throw error;
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateObject(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.objects.write");
    const context = await authorized(["tenant_admin", "management", "planner", "finance"], ["planning"]);
    const input = z.object({
      objectId: z.string().uuid(), customerId: z.string().uuid(), name: z.string().trim().min(2).max(160),
      street: z.string().trim().min(2).max(200), postalCode: z.string().trim().min(4).max(16),
      city: z.string().trim().min(2).max(120), instructions: z.string().trim().max(2000).optional(),
      active: z.enum(["true", "false"]),
    }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase.from("customers").select("id").eq("tenant_id", context.tenant.id).eq("id", input.customerId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Selecteer een bestaande klant binnen deze tenant");
    const { data, error } = await supabase.from("objects").update({
      customer_id: input.customerId, name: input.name,
      address: await addressFromForm(formData, "addressPayload", true),
      access_instructions: input.instructions || null, active: input.active === "true",
    }).eq("tenant_id", context.tenant.id).eq("id", input.objectId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Object niet gevonden binnen deze tenant");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function archiveObject(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.objects.write");
    const context = await authorized(["tenant_admin", "management"], ["planning"]);
    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const supabase = await createClient();
    const { data, error } = await supabase.from("objects").update({ active: false })
      .eq("tenant_id", context.tenant.id).eq("id", objectId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Object niet gevonden binnen deze tenant");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createPersonnelFunction(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management"], ["personeel"]);
    const input = z.object({
      name: z.string().trim().min(2).max(120),
      discipline: z.string().trim().min(2).max(120),
      certificateCodes: z.string().trim().max(500).optional(),
    }).parse(Object.fromEntries(formData));
    const requiredCertificateCodes = (input.certificateCodes ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
    if (requiredCertificateCodes.some((code) => !/^[A-Z0-9][A-Z0-9_.-]{0,31}$/.test(code))) throw new Error("Gebruik geldige certificaatcodes, gescheiden door komma’s");
    const supabase = await createClient();
    const { error } = await supabase.from("function_catalog").insert({ tenant_id: context.tenant.id, name: input.name, discipline: input.discipline, required_certificate_codes: [...new Set(requiredCertificateCodes)] });
    if (error) throw error;
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function assignPersonnelFunction(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({ personnelId: z.string().uuid(), functionId: z.string().uuid() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("personnel_functions").upsert({ tenant_id: context.tenant.id, personnel_id: input.personnelId, function_id: input.functionId }, { onConflict: "tenant_id,personnel_id,function_id" });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function addQualification(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({
      personnelId: z.string().uuid(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_.-]{0,31}$/),
      name: z.string().trim().min(2).max(160), issuedAt: z.string().date().or(z.literal("")), validUntil: z.string().date().or(z.literal("")),
    }).parse(Object.fromEntries(formData));
    if (input.issuedAt && input.validUntil && input.validUntil < input.issuedAt) throw new Error("De geldigheidsdatum ligt voor de uitgiftedatum");
    const supabase = await createClient();
    if(input.code==="VOG"||/\bVOG\b/i.test(input.name))throw new Error("Gebruik VOG-controle in het personeelsdossier.");
    const {error:catalogError}=await supabase.from("qualification_types").upsert({tenant_id:context.tenant.id,code:input.code,name:input.name},{onConflict:"tenant_id,code",ignoreDuplicates:true});
    if(catalogError)throw catalogError;
    const {error}=await supabase.from("certificates").insert({tenant_id:context.tenant.id,personnel_id:input.personnelId,code:input.code,name:input.name,issued_on:input.issuedAt||null,valid_from:input.issuedAt||null,expires_on:input.validUntil||null,dossier_managed:true,dossier_status:"unverified"});
    if(error)throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function addAvailability(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({ personnelId: z.string().uuid(), start: z.string().min(10), end: z.string().min(10), kind: z.enum(["available", "unavailable", "leave", "sick"]), note: z.string().trim().max(500).optional() }).parse(Object.fromEntries(formData));
    const start = new Date(input.start); const end = new Date(input.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Ongeldige beschikbaarheidsperiode");
    const supabase = await createClient();
    const { error } = await supabase.from("availability").insert({ tenant_id: context.tenant.id, personnel_id: input.personnelId, starts_at: start.toISOString(), ends_at: end.toISOString(), kind: input.kind, note: input.note || null, approved_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function uploadPersonnelDocument(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.personnel.write");
    const context = await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const input = z.object({ personnelId: z.string().uuid(), title: z.string().trim().min(2).max(160), documentType: z.string().trim().min(2).max(80), visibleToEmployee: z.string().optional(), privacyConfirmed:z.literal("on") }).parse(Object.fromEntries(formData));
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecteer een document");
    privacyText(input.title+" "+file.name+" "+input.documentType);
    if(/\bVOG\b|verklaring.omtrent.gedrag|medisch|paspoort/i.test(input.title+" "+file.name+" "+input.documentType))throw new Error("Dit bestand mag niet worden bewaard in het personeelsdossier.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension=customerDocumentExtension(file.type,bytes);
    const documentId = randomBytes(16).toString("hex");
    const path = `${context.tenant.id}/${input.personnelId}/${documentId}.${extension}`;
    const supabase = await createClient();
    await uploadScannedFile(supabase, "personnel-documents", path, bytes, file.type);
    const { error } = await supabase.from("personnel_documents").insert({ tenant_id: context.tenant.id, personnel_id: input.personnelId, title: input.title, document_type: input.documentType, storage_path: path, visible_to_employee: input.visibleToEmployee === "on", created_by: context.user.id, file_name: file.name, mime_type: file.type, size_bytes: file.size, sha256: createHash("sha256").update(bytes).digest("hex") });
    if (error) { await createAdminClient().storage.from("personnel-documents").remove([path]); throw error; }
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function rescheduleWorkOrder(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.planning.write");
    await authorized(["tenant_admin", "management", "planner"], ["planning"]);
    const raw = Object.fromEntries(formData);
    if (typeof raw.workOrderKey === "string" && raw.workOrderKey.includes(":")) {
      const [workOrderId, version] = raw.workOrderKey.split(":"); raw.workOrderId = workOrderId; raw.version = version;
    }
    const input = z.object({ workOrderId: z.string().uuid(), personnelId: z.string().uuid(), start: z.string().min(10), version: z.coerce.number().int().positive() }).parse(raw);
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new Error("Ongeldige starttijd");
    const supabase = await createClient();
    const { error } = await supabase.rpc("reschedule_work_order", { target_work_order_id: input.workOrderId, target_personnel_id: input.personnelId, target_start_at: start.toISOString(), expected_version: input.version });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function completeReminder(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.followup.write");
    await authorized(["tenant_admin", "management", "hr"], ["personeel"]);
    const reminderId = z.string().uuid().parse(formData.get("reminderId"));
    const supabase = await createClient();
    const { error } = await supabase.from("reminders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", reminderId).eq("status", "open");
    if (error) throw error;
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createExtraWorkRule(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.tasks.write");
    const context = await authorized(["tenant_admin", "management", "planner"], ["planning", "rapportage"]);
    const input = z.object({ taskRevisionId: z.string().uuid(), requiresPhoto: z.string().optional() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("extra_work_rules").upsert({ tenant_id: context.tenant.id, task_revision_id: input.taskRevisionId, requires_photo: input.requiresPhoto === "on", requires_review: true, active: true }, { onConflict: "tenant_id,task_revision_id" });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function allowExtraWork(formData: FormData): Promise<ActionResult> {
  try {
    await requireBackofficePermission("backoffice.tasks.write");
    const context = await authorized(["tenant_admin", "management", "planner"], ["planning", "rapportage"]);
    const input = z.object({ workOrderId: z.string().uuid(), ruleId: z.string().uuid() }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("work_order_allowed_extra_work").upsert({ tenant_id: context.tenant.id, work_order_id: input.workOrderId, extra_work_rule_id: input.ruleId }, { onConflict: "tenant_id,work_order_id,extra_work_rule_id" });
    if (error) throw error;
    revalidatePath("/app"); revalidatePath("/staff");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}
