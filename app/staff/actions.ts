"use server";
import { addressSchema } from "@/lib/addresses/model";
import { verifiedAddress } from "@/lib/addresses/form";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportRpc } from "@/lib/work-orders/report-rpc";
import { reportVersionSchema, type ReportVersion } from "@/lib/work-orders/report-model";
import { validateSignaturePng } from "@/lib/work-orders/report-signature";
import { validateReportPhoto } from "@/lib/work-orders/report-photo";
import { publishScannedFile, uploadScannedFile, scanFileBytes } from "@/lib/files/scanned-storage";
import { ticketFileName, validateTicketFile } from "@/lib/tickets/files-validation";
import { resolveStaffTimeCorrection, type StaffTimeCorrectionInput } from "@/lib/staff/time-correction";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik een geldige datum");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gebruik een geldige tijd");
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const optionalPhone = z.string().trim().max(50).regex(/^$|^\+?[\d\s().-]{7,24}$/, "Gebruik een geldig telefoonnummer");
const availabilityDaySchema = z.object({
  enabled: z.boolean(),
  start: timeSchema,
  end: timeSchema,
}).strict().superRefine((day, issue) => {
  if (day.enabled && day.start >= day.end) issue.addIssue({ code: "custom", path: ["end"], message: "De eindtijd moet na de begintijd liggen" });
});
const availabilityPreferencesSchema = z.object({
  week: z.record(z.string().trim().min(1).max(16), availabilityDaySchema).refine((week) => Object.keys(week).length <= 7, "Gebruik maximaal zeven weekdagen"),
  shifts: z.array(z.enum(["day", "evening", "night"])).max(3),
  planningNote: z.string().trim().max(1000),
  weekends: z.boolean(),
  holidays: z.boolean(),
}).strict();
const updateAvailabilitySchema = availabilityPreferencesSchema.extend({ version: z.number().int().nonnegative() }).strict();
const homeAddressSchema = z.object({
  address: addressSchema.optional(),
  street: z.string().trim().max(200),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(120),
  country: z.string().trim().max(80),
}).strict().superRefine((address, issue) => {
  const country = address.country.trim().toLocaleUpperCase("nl-NL");
  if (["NL", "NEDERLAND", "NETHERLANDS"].includes(country) && address.postalCode.trim() && !/^\d{4}\s?[A-Z]{2}$/i.test(address.postalCode.trim())) {
    issue.addIssue({ code: "custom", path: ["postalCode"], message: "Gebruik een geldige Nederlandse postcode" });
  }
});
const profileDetailsSchema = z.object({
  version: z.number().int().nonnegative(),
  fullName: z.string().trim().min(2).max(200),
  preferredName: z.string().trim().max(100),
  phone: optionalPhone,
  mobilePhone: optionalPhone,
  birthDate: z.union([dateSchema, z.literal("")]),
  homeAddress: homeAddressSchema,
  emergencyContact: z.object({
    name: z.string().trim().max(160),
    phone: optionalPhone,
    relation: z.string().trim().max(100),
  }).strict(),
}).strict();
const transportSchema = z.object({
  vehicle: z.enum(["car", "van", "motorcycle", "scooter", "electric_bicycle", "bicycle", "public_transport", "walking", "other"]),
  departureKind: z.enum(["home", "depot", "alternate"]),
  departureDepotId: z.string().uuid().nullable(),
  alternateDepartureAddress: homeAddressSchema.nullable(),
  returnToDeparture: z.boolean(),
  ownTransport: z.boolean(),
  drivingLicense: z.boolean(),
  drivingLicenseCategories: z.array(z.string().trim().min(1).max(10)).max(12),
  carpoolAllowed: z.boolean(),
  limitations: z.string().trim().max(1000),
}).strict().superRefine((transport, issue) => {
  if (transport.departureKind === "depot" && !transport.departureDepotId) issue.addIssue({ code: "custom", path: ["departureDepotId"], message: "Kies een vestiging" });
  if (transport.departureKind === "alternate" && (!transport.alternateDepartureAddress?.street.trim() || !transport.alternateDepartureAddress.postalCode.trim() || !transport.alternateDepartureAddress.city.trim())) issue.addIssue({ code: "custom", path: ["alternateDepartureAddress"], message: "Vul een volledige vertreklocatie in" });
  if (transport.drivingLicense && transport.drivingLicenseCategories.length === 0) issue.addIssue({ code: "custom", path: ["drivingLicenseCategories"], message: "Kies minimaal één rijbewijscategorie" });
});
const profileSchema = profileDetailsSchema.extend({ transport: transportSchema }).strict();
const contactSchema = profileDetailsSchema.pick({ version: true, fullName: true, mobilePhone: true }).extend({
  fullName: z.string().trim().min(2).max(160),
}).strict();
const notificationPreferenceSchema = z.object({
  version: z.number().int().nonnegative(),
  push: z.boolean(),
  email: z.boolean(),
  quietEnabled: z.boolean(),
  quietStart: timeSchema,
  quietEnd: timeSchema,
  timezone: z.string().trim().min(1).max(100),
  types: z.array(z.object({
    code: z.string().trim().min(1).max(150),
    name: z.string().trim().min(1).max(200),
    channels: z.array(z.enum(["in_app", "push", "email"])).max(3),
    email: z.boolean(),
    push: z.boolean(),
    reason: z.string().max(500),
  }).strict()).max(200),
}).strict();
const onboardingDraftSchema = z.object({
  profile: profileDetailsSchema.omit({ version: true }),
  transport: transportSchema,
  notifications: notificationPreferenceSchema,
  availability: availabilityPreferencesSchema,
  confirmations: z.object({ details: z.boolean(), availability: z.boolean(), notifications: z.boolean(), privacy: z.boolean(), terms: z.boolean() }).strict(),
}).strict();
const onboardingSchema = z.object({
  onboardingVersion: z.number().int().positive(),
  personnelVersion: z.number().int().positive(),
  step: z.number().int().min(0).max(5),
  draft: onboardingDraftSchema,
  complete: z.boolean(),
}).strict().superRefine((input, issue) => {
  if (!input.complete) return;
  const profile = input.draft.profile;
  if (profile.mobilePhone.trim().length < 7) issue.addIssue({ code: "custom", path: ["draft", "profile", "mobilePhone"], message: "Vul een geldig mobiel nummer in" });
  if (!profile.homeAddress.street.trim()) issue.addIssue({ code: "custom", path: ["draft", "profile", "homeAddress", "street"], message: "Vul je straat en huisnummer in" });
  if (!profile.homeAddress.postalCode.trim()) issue.addIssue({ code: "custom", path: ["draft", "profile", "homeAddress", "postalCode"], message: "Vul je postcode in" });
  if (!profile.homeAddress.city.trim()) issue.addIssue({ code: "custom", path: ["draft", "profile", "homeAddress", "city"], message: "Vul je woonplaats in" });
  if (!input.draft.confirmations.details || !input.draft.confirmations.notifications || !input.draft.confirmations.privacy || !input.draft.confirmations.terms) issue.addIssue({ code: "custom", path: ["draft", "confirmations"], message: "Controleer alle profiel-, meldings- en privacybevestigingen" });
});
const leaveCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), leaveType: z.enum(["vacation", "short", "care", "unpaid", "other"]), startsOn: dateSchema, endsOn: dateSchema, note: nullableText(1000), idempotencyKey: z.string().uuid() }).strict()
    .refine((input) => input.startsOn <= input.endsOn, { path: ["endsOn"], message: "De einddatum moet op of na de begindatum liggen" }),
  z.object({ command: z.literal("withdraw"), leaveRequestId: z.string().uuid(), version: z.number().int().nonnegative(), reason: nullableText(500), idempotencyKey: z.string().uuid() }).strict(),
]);
const dayCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("close"), workDay: dateSchema, note: nullableText(1000), idempotencyKey: z.string().uuid() }).strict(),
  z.object({ command: z.enum(["confirm", "reopen"]), dayReviewId: z.string().uuid(), version: z.number().int().nonnegative(), note: nullableText(1000), idempotencyKey: z.string().uuid() }).strict(),
]);
const workOrderCostCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("add_material"), workOrderId: z.string().uuid(), taskId: z.string().uuid().nullable(), description: z.string().trim().min(2).max(300), quantity: z.number().positive().max(10_000), unit: z.string().trim().min(1).max(40), unitPriceCents: z.number().int().min(0).max(10_000_000), customerVisible: z.boolean(), idempotencyKey: z.string().uuid() }).strict(),
  z.object({ command: z.literal("remove_material"), workOrderId: z.string().uuid(), materialId: z.string().uuid(), idempotencyKey: z.string().uuid() }).strict(),
  z.object({ command: z.literal("add_expense"), workOrderId: z.string().uuid(), description: z.string().trim().min(2).max(300), amountCents: z.number().int().min(1).max(100_000_000), customerVisible: z.boolean(), idempotencyKey: z.string().uuid() }).strict(),
  z.object({ command: z.literal("remove_expense"), workOrderId: z.string().uuid(), expenseId: z.string().uuid(), version: z.number().int().nonnegative(), idempotencyKey: z.string().uuid() }).strict(),
]);
const extraWorkRequestSchema = z.object({
  workOrderId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  reason: z.string().trim().min(3).max(1000),
  minutes: z.number().int().min(5).max(480).refine((value) => value % 5 === 0, "Gebruik stappen van vijf minuten"),
  amountCents: z.number().int().min(0).max(10_000_000).nullable(),
  idempotencyKey: z.string().uuid(),
}).strict();
const customerAbsentSchema = z.object({
  reportId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: z.string().uuid(),
}).strict();

export type SaveStaffOnboardingInput = z.input<typeof onboardingSchema>;
export type UpdateStaffProfileInput = z.input<typeof profileSchema>;
export type UpdateStaffContactInput = z.input<typeof contactSchema>;
export type UpdateStaffAvailabilityInput = z.input<typeof updateAvailabilitySchema>;
export type StaffLeaveCommandInput = z.input<typeof leaveCommandSchema>;
export type StaffDayCommandInput = z.input<typeof dayCommandSchema>;
export type StaffWorkOrderCostCommandInput = z.input<typeof workOrderCostCommandSchema>;
export type StaffExtraWorkRequestInput = z.input<typeof extraWorkRequestSchema>;

function revalidateStaffWorkspaces() {
  revalidatePath("/staff");
  revalidatePath("/app");
}

function mutationUuid(parts: Array<string | number>) {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = ((Number.parseInt(hash[16], 16) & 3) | 8).toString(16);
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function reportFileName(name: string, extension: string) {
  const safe = ticketFileName(name);
  const stem = safe.replace(/\.[^.]*$/, "").trim() || "bijlage";
  return `${stem}.${extension}`;
}

function reportAttachmentExtension(file: File) {
  const extensions: Record<string, "jpg" | "png" | "webp" | "pdf"> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  const extension = extensions[file.type];
  if (file.size > 10 * 1024 * 1024 || !extension) throw new Error("Gebruik JPG, PNG, WebP of PDF van maximaal 10 MB");
  return extension;
}

async function validateReportAttachment(file: File) {
  reportAttachmentExtension(file);
  const original = new Uint8Array(await file.arrayBuffer());
  const validated = file.type === "application/pdf"
    ? { bytes: await validateTicketFile(original, file.type), mime: "application/pdf", extension: "pdf" }
    : await validateReportPhoto(original, file.type);
  return { ...validated, fileName: reportFileName(file.name, validated.extension) };
}

async function staffContext(services: string[] = []) {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.enabledServices.includes("personeel") || !context.tenant.roles.includes("staff")) throw new Error("Personeelstoegang vereist");
  if (services.some((service) => !context.tenant!.enabledServices.includes(service))) throw new Error("Deze module is niet actief voor de tenant");
  return { ...context, tenant: context.tenant };
}

export async function transitionWorkOrder(input: { workOrderId: string; action: "open" | "travel" | "start" | "complete" | "resubmit" | "return" | "stop" | "pause" | "resume"; version: number; reason?: string; note?: string; idempotencyKey: string }): Promise<ActionResult> {
  try {
    await staffContext(["planning"]);
    const parsed = z.object({
      workOrderId: z.string().uuid(),
      action: z.enum(["open", "travel", "start", "complete", "resubmit", "return", "stop", "pause", "resume"]),
      version: z.number().int(),
      reason: z.string().trim().max(80).optional(),
      note: z.string().trim().max(1000).optional(),
      idempotencyKey: z.string().min(8),
    }).strict().superRefine((value, issue) => {
      if (value.action !== "return") return;
      if (!["customer_unavailable", "unsafe_situation", "materials_missing", "planning_issue", "other"].includes(value.reason ?? "")) {
        issue.addIssue({ code: "custom", path: ["reason"], message: "Kies een geldige terugmeldreden" });
      }
      if ((value.note ?? "").length < 3) {
        issue.addIssue({ code: "custom", path: ["note"], message: "Geef een concrete toelichting" });
      }
    }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("transition_work_order", { target_work_order_id: parsed.workOrderId, action: parsed.action, expected_version: parsed.version, idempotency_key: parsed.idempotencyKey, reason_code: parsed.reason, note: parsed.note });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function extendStaffWorkOrder(input: { workOrderId: string; version: number; idempotencyKey: string }): Promise<ActionResult> {
  try {
    await staffContext(["planning", "rapportage"]);
    const parsed = z.object({ workOrderId: z.uuid(), version: z.number().int().positive(), idempotencyKey: z.uuid() }).strict().parse(input);
    const db = await createClient();
    const { error } = await db.rpc("extend_staff_work_order", { target_work_order: parsed.workOrderId, expected_version: parsed.version, idempotency_key: parsed.idempotencyKey });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app/planning");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function setTaskCompletion(input: { taskId: string; version: number; quantity: number }): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = z.object({
      taskId: z.string().uuid(),
      version: z.number().int().positive(),
      quantity: z.number().nonnegative(),
    }).strict().parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("record_task_execution", {
      target_tenant: context.tenant.id,
      target_task: parsed.taskId,
      expected_version: parsed.version,
      result: "completed",
      actual_quantity: parsed.quantity,
      reason: "",
    });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveStaffOnboarding(input: SaveStaffOnboardingInput): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const parsed = onboardingSchema.parse(input);
    const { complete, ...payload } = parsed;
    if(payload.draft.profile.homeAddress.address)payload.draft.profile.homeAddress.address=await verifiedAddress(payload.draft.profile.homeAddress.address, false);
    if(payload.draft.transport.alternateDepartureAddress?.address)payload.draft.transport.alternateDepartureAddress.address=await verifiedAddress(payload.draft.transport.alternateDepartureAddress.address, false);
    // Empty address objects from the management form are placeholders. Only
    // send an alternate address when the employee actually departs from it.
    if (payload.draft.transport.departureKind !== "alternate") payload.draft.transport.alternateDepartureAddress = null;
    await reportRpc(await createClient(), "staff_save_onboarding", {
      target_tenant: context.tenant.id,
      input: payload,
      complete,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateStaffProfile(input: UpdateStaffProfileInput): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const payload = profileSchema.parse(input);
    if(payload.homeAddress.address)payload.homeAddress.address=await verifiedAddress(payload.homeAddress.address, false);
    if(payload.transport.alternateDepartureAddress?.address)payload.transport.alternateDepartureAddress.address=await verifiedAddress(payload.transport.alternateDepartureAddress.address, false);
    await reportRpc(await createClient(), "staff_update_profile", { target_tenant: context.tenant.id, input: payload });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateStaffAvailability(input: UpdateStaffAvailabilityInput): Promise<ActionResult<{ version: number }>> {
  try {
    const context = await staffContext();
    const payload = updateAvailabilitySchema.parse(input);
    const updated = z.object({ version: z.coerce.number().int().positive() }).passthrough().parse(
      await reportRpc(await createClient(), "staff_update_availability", { target_tenant: context.tenant.id, input: payload }),
    );
    revalidateStaffWorkspaces();
    return { ok: true, version: updated.version };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateStaffContact(input: UpdateStaffContactInput): Promise<ActionResult<{ version: number }>> {
  try {
    const context = await staffContext();
    const payload = contactSchema.parse(input);
    const updated = z.object({ version: z.coerce.number().int().positive() }).passthrough().parse(
      await reportRpc(await createClient(), "staff_update_profile", { target_tenant: context.tenant.id, input: payload }),
    );
    revalidateStaffWorkspaces();
    return { ok: true, version: updated.version };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function runStaffLeaveCommand(input: StaffLeaveCommandInput): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const { command, idempotencyKey, ...payload } = leaveCommandSchema.parse(input);
    await reportRpc(await createClient(), "staff_leave_command", {
      target_tenant: context.tenant.id,
      command,
      input: payload,
      idempotency_key: idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function runStaffDayCommand(input: StaffDayCommandInput): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const { command, idempotencyKey, ...payload } = dayCommandSchema.parse(input);
    await reportRpc(await createClient(), "staff_day_command", {
      target_tenant: context.tenant.id,
      command,
      input: payload,
      idempotency_key: idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function runStaffWorkOrderCostCommand(input: StaffWorkOrderCostCommandInput): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = workOrderCostCommandSchema.parse(input);
    let rpcCommand: "material.create" | "material.delete" | "expense.create" | "expense.delete";
    let rpcInput: Record<string, unknown>;
    if (parsed.command === "add_material") {
      rpcCommand = "material.create";
      rpcInput = { orderId: parsed.workOrderId, taskId: parsed.taskId, description: parsed.description, quantity: parsed.quantity, unit: parsed.unit, unitPriceCents: parsed.unitPriceCents, customerVisible: parsed.customerVisible };
    } else if (parsed.command === "remove_material") {
      rpcCommand = "material.delete";
      rpcInput = { id: parsed.materialId };
    } else if (parsed.command === "add_expense") {
      rpcCommand = "expense.create";
      rpcInput = { orderId: parsed.workOrderId, description: parsed.description, amountCents: parsed.amountCents, customerVisible: parsed.customerVisible };
    } else {
      rpcCommand = "expense.delete";
      rpcInput = { id: parsed.expenseId, version: parsed.version };
    }
    await reportRpc(await createClient(), "staff_work_order_cost_command", {
      target_tenant: context.tenant.id,
      command: rpcCommand,
      input: rpcInput,
      idempotency_key: parsed.idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function requestStaffExtraWork(input: StaffExtraWorkRequestInput): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = extraWorkRequestSchema.parse(input);
    await reportRpc(await createClient(), "staff_request_extra_work", {
      target_tenant: context.tenant.id,
      input: {
        workOrderId: parsed.workOrderId,
        title: parsed.title,
        reason: parsed.reason,
        minutes: parsed.minutes,
        amountCents: parsed.amountCents,
      },
      idempotency_key: parsed.idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function reportStaffCustomerAbsent(input: z.input<typeof customerAbsentSchema>): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = customerAbsentSchema.parse(input);
    await reportRpc(await createClient(), "staff_report_customer_absent", {
      target_tenant: context.tenant.id,
      target_report: parsed.reportId,
      expected_content_hash: parsed.contentHash,
      absence_reason: parsed.reason,
      idempotency_key: parsed.idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function loadStaffSignaturePreview(input: {
  reportId: string;
  contentHash: string;
}): Promise<ActionResult<{ data: ReportVersion }>> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = z.object({
      reportId: z.string().uuid(),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict().parse(input);
    const data = await reportRpc(await createClient(), "staff_report_signature_preview", {
      target_tenant: context.tenant.id,
      target_report: parsed.reportId,
      expected_content_hash: parsed.contentHash,
    });
    return { ok: true, data: reportVersionSchema.parse(data) };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function addReportEntry(formData: FormData): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const workOrderId = z.string().uuid().parse(formData.get("workOrderId"));
    const mutationId = z.string().uuid().parse(formData.get("mutationId"));
    const body = z.string().trim().min(1).max(5000).parse(formData.get("body"));
    const severityValue = formData.get("severity");
    const severity = severityValue ? z.enum(["low", "medium", "high", "critical"]).parse(severityValue) : null;
    const customerVisible=formData.get("customerVisible")==="on";
    const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length > 5) throw new Error("Maximaal vijf bijlagen per bericht");
    const supabase = await createClient();
    const uploadIntents = files.map((file, index) => {
      const extension = reportAttachmentExtension(file);
      const id = mutationUuid([context.tenant.id, context.user.id, "report-attachment", mutationId, index]);
      return {
        file,
        id,
        storagePath: `${context.tenant.id}/${workOrderId}/${mutationId}/${id}.${extension}`,
      };
    });
    const authorizeUpload = async (storagePath: string) => {
      const allowed = await reportRpc(supabase, "staff_report_upload_allowed", {
        target_tenant: context.tenant.id,
        target_order: workOrderId,
        target_entry: mutationId,
        target_path: storagePath,
      });
      if (allowed !== true) throw new Error("Geen actuele toegang om dit rapportbestand op te slaan.");
    };
    // Reject an inaccessible work order before decoding, normalizing or
    // scanning attacker-controlled bytes. Publication repeats this live check.
    await Promise.all(uploadIntents.map(({ storagePath }) => authorizeUpload(storagePath)));
    const staged = await Promise.all(uploadIntents.map(async ({ file, id, storagePath }) => {
      const { fileName, bytes, mime } = await validateReportAttachment(file);
      return {
        id,
        fileName,
        bytes,
        mime,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        storagePath,
      };
    }));
    const finalizeInput = {
      reportEntryId: mutationId,
      workOrderId,
      body,
      customerVisible,
      incidentSeverity: severity,
      attachments: staged.map(({ id, fileName, mime, sizeBytes, sha256, storagePath }) => ({
        id, fileName, mimeType: mime, sizeBytes, sha256, storagePath,
      })),
    };
    const publishedPaths: string[] = [];
    const cleanupIfUncommitted = async () => {
      try {
        const admin = createAdminClient();
        // A failed response can hide a successful commit. Only delete objects
        // when the exact mutation parent is demonstrably absent; query errors
        // and UUID collisions deliberately fail safe and retain the bytes.
        const committed = await admin.from("report_entries")
          .select("id")
          .eq("tenant_id", context.tenant.id)
          .eq("id", mutationId)
          .eq("work_order_id", workOrderId)
          .eq("author_user_id", context.user.id)
          .maybeSingle();
        if (committed.data || committed.error || !publishedPaths.length) return;
        const removed = await admin.storage.from("reports").remove(publishedPaths);
        if (removed.error) console.error("Gestagede rapportbestanden konden niet volledig worden opgeruimd.", removed.error);
      } catch (cleanupError) {
        // Cleanup is deliberately best-effort. An inaccessible staged object
        // is safer than deleting bytes whose finalize outcome is uncertain.
        console.error("Gestagede rapportbestanden konden niet veilig worden gecontroleerd.", cleanupError);
      }
    };
    const finalize = () => reportRpc(supabase, "staff_finalize_report_entry", {
      target_tenant: context.tenant.id,
      input: finalizeInput,
      idempotency_key: mutationId,
    });
    let finalizeAttempted = false;
    try {
      for (const attachment of staged) {
        await publishScannedFile({
          bucket: "reports",
          path: attachment.storagePath,
          bytes: attachment.bytes,
          mime: attachment.mime,
          authorize: () => authorizeUpload(attachment.storagePath),
        });
        // Objects whose publication outcome is uncertain are never cleanup
        // candidates; only confirmed writes from this invocation are tracked.
        publishedPaths.push(attachment.storagePath);
      }
      finalizeAttempted = true;
      await finalize();
    } catch (failure) {
      let reportedFailure = failure;
      let recovered = false;
      if (finalizeAttempted) {
        try {
          // The database command is idempotent. A retry is the only reliable
          // way to distinguish a rejected payload from a lost success response.
          await finalize();
          recovered = true;
        } catch (retryFailure) {
          reportedFailure = retryFailure;
        }
      }
      if (!recovered) {
        await cleanupIfUncommitted();
        throw reportedFailure;
      }
    }
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateReportEntry(input: { entryId: string; version: number; body: string }): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = z.object({ entryId: z.string().uuid(), version: z.number().int().positive(), body: z.string().trim().min(1).max(5000) }).strict().parse(input);
    const payload = { reportEntryId: parsed.entryId, version: parsed.version, body: parsed.body };
    await reportRpc(await createClient(), "staff_report_entry_command", {
      target_tenant: context.tenant.id,
      command: "update",
      input: payload,
      idempotency_key: mutationUuid([context.tenant.id, context.user.id, "report-entry-update", parsed.entryId, parsed.version, parsed.body]),
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function deleteReportEntry(input: { entryId: string; version: number }): Promise<ActionResult> {
  try {
    const context = await staffContext(["planning", "rapportage"]);
    const parsed = z.object({ entryId: z.string().uuid(), version: z.number().int().positive() }).strict().parse(input);
    const payload = { reportEntryId: parsed.entryId, version: parsed.version };
    await reportRpc(await createClient(), "staff_report_entry_command", {
      target_tenant: context.tenant.id,
      command: "delete",
      input: payload,
      idempotency_key: mutationUuid([context.tenant.id, context.user.id, "report-entry-delete", parsed.entryId, parsed.version]),
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function captureSignature(input: { workOrderId: string; signerName: string; signerCapacity: string; dataUrl: string; reportId: string; contentHash: string; kind: "customer" | "employee"; idempotencyKey: string }): Promise<ActionResult> {
  try {
    await staffContext(["rapportage", "planning"]);
    const v = z.object({ workOrderId:z.uuid(),signerName:z.string().trim().min(2).max(120),signerCapacity:z.string().trim().min(2).max(120),dataUrl:z.string().max(2_800_000),reportId:z.uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(["customer","employee"]),idempotencyKey:z.uuid() }).parse(input);
    const {bytes,sha256}=await validateSignaturePng(v.dataUrl);
    await scanFileBytes(Buffer.from(v.dataUrl.slice("data:image/png;base64,".length),"base64"),"image/png");
    const db=await createClient();
    const intent=await reportRpc(db,"prepare_work_order_signature",{target_work_order_id:v.workOrderId,target_report_id:v.reportId,expected_hash:v.contentHash,signer_name:v.signerName,signer_capacity:v.signerCapacity,signature_kind:v.kind,idempotency_key:v.idempotencyKey}) as {id:string;path:string;consumed:boolean};
    const admin=createAdminClient();
    if(!intent.consumed){
      await uploadScannedFile(db,"signatures",intent.path,bytes,"image/png");
    }
    await reportRpc(admin,"finalize_work_order_signature",{target_intent:intent.id,image_hash:sha256});
    revalidatePath("/staff","layout");revalidatePath("/app","layout");return {ok:true};
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function toggleShiftInterest(input: { shiftId: string; interested: boolean }): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const parsed = z.object({ shiftId: z.string().uuid(), interested: z.boolean() }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_shift_interest", { target_tenant: context.tenant.id, target_shift: parsed.shiftId, interested: parsed.interested });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function markAnnouncementRead(announcementId: string): Promise<ActionResult> {
  try {
    const context = await staffContext();
    z.string().uuid().parse(announcementId);
    const supabase = await createClient();
    const { error } = await supabase.from("announcement_reads").upsert({ tenant_id: context.tenant.id, announcement_id: announcementId, user_id: context.user.id }, { onConflict: "tenant_id,announcement_id,user_id" });
    if (error) throw error;
    revalidatePath("/staff"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function requestTimeCorrection(input: StaffTimeCorrectionInput): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const parsed = resolveStaffTimeCorrection(input, context.tenant.timezone);
    await reportRpc(await createClient(), "staff_request_time_correction", {
      target_tenant: context.tenant.id,
      target_time_entry: parsed.timeEntryId,
      expected_version: parsed.version,
      correction_mode: parsed.mode,
      requested_start: parsed.requestedStartsAt,
      requested_end: parsed.requestedEndsAt,
      requested_duration: parsed.requestedDurationMinutes,
      reason: parsed.reason,
      idempotency_key: parsed.idempotencyKey,
    });
    revalidateStaffWorkspaces();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function addExtraWork(input: { workOrderId: string; ruleId: string; idempotencyKey: string }): Promise<ActionResult> {
  try {
    await staffContext(["planning", "rapportage"]);
    const parsed = z.object({ workOrderId: z.string().uuid(), ruleId: z.string().uuid(), idempotencyKey: z.string().min(8) }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_extra_work", { target_work_order_id: parsed.workOrderId, target_extra_work_rule_id: parsed.ruleId, idempotency_key: parsed.idempotencyKey });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}
