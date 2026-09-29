"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";

async function staffContext(services: string[] = []) {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.enabledServices.includes("personeel") || !context.tenant.roles.includes("staff")) throw new Error("Personeelstoegang vereist");
  if (services.some((service) => !context.tenant!.enabledServices.includes(service))) throw new Error("Deze module is niet actief voor de tenant");
  return { ...context, tenant: context.tenant };
}

export async function transitionWorkOrder(input: { workOrderId: string; action: "open" | "travel" | "start" | "complete" | "resubmit" | "return"; version: number; reason?: string; note?: string; idempotencyKey: string }): Promise<ActionResult> {
  try {
    await staffContext(["planning"]);
    const parsed = z.object({ workOrderId: z.string().uuid(), action: z.enum(["open", "travel", "start", "complete", "resubmit", "return"]), version: z.number().int(), reason: z.string().optional(), note: z.string().optional(), idempotencyKey: z.string().min(8) }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("transition_work_order", { target_work_order_id: parsed.workOrderId, action: parsed.action, expected_version: parsed.version, idempotency_key: parsed.idempotencyKey, reason_code: parsed.reason, note: parsed.note });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function setTaskCompletion(input: { taskId: string; completed: boolean; note?: string }): Promise<ActionResult> {
  try {
    await staffContext(["planning"]);
    const parsed = z.object({ taskId: z.string().uuid(), completed: z.boolean(), note: z.string().optional() }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("complete_work_order_task", { target_task_id: parsed.taskId, completed: parsed.completed, completion_note: parsed.note });
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function addReportEntry(formData: FormData): Promise<ActionResult> {
  try {
    const context = await staffContext(["rapportage"]);
    const workOrderId = z.string().uuid().parse(formData.get("workOrderId"));
    const body = z.string().trim().min(1).max(5000).parse(formData.get("body"));
    const severityValue = formData.get("severity");
    const severity = severityValue ? z.enum(["low", "medium", "high", "critical"]).parse(severityValue) : null;
    const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length > 8) throw new Error("Maximaal acht foto’s per bericht");
    if (files.some((file) => file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) throw new Error("Gebruik JPG, PNG of WebP van maximaal 10 MB");
    const supabase = await createClient();
    const { data: entry, error } = await supabase.from("report_entries").insert({ tenant_id: context.tenant.id, work_order_id: workOrderId, author_user_id: context.user.id, body, is_incident: Boolean(severity), incident_severity: severity, incident_status: severity ? "open" : null }).select().single();
    if (error) throw error;
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const extension = file.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${context.tenant.id}/${workOrderId}/${entry.id}/${randomUUID()}.${extension}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { error: uploadError } = await supabase.storage.from("reports").upload(path, bytes, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const { error: metadataError } = await supabase.from("attachments").insert({ tenant_id: context.tenant.id, work_order_id: workOrderId, report_entry_id: entry.id, uploaded_by: context.user.id, storage_bucket: "reports", storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, sha256: createHash("sha256").update(bytes).digest("hex") });
        if (metadataError) throw metadataError;
      }
    } catch (uploadFailure) {
      if (uploaded.length) await supabase.storage.from("reports").remove(uploaded);
      await supabase.from("report_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entry.id);
      throw uploadFailure;
    }
    revalidatePath("/staff"); revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateReportEntry(input: { entryId: string; body: string }): Promise<ActionResult> {
  try {
    await staffContext(["rapportage"]);
    const parsed = z.object({ entryId: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("report_entries").update({ body: parsed.body }).eq("id", parsed.entryId);
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function deleteReportEntry(entryId: string): Promise<ActionResult> {
  try {
    await staffContext(["rapportage"]);
    z.string().uuid().parse(entryId);
    const supabase = await createClient();
    const deletedAt = new Date().toISOString();
    const { error: attachmentError } = await supabase.from("attachments").update({ deleted_at: deletedAt }).eq("report_entry_id", entryId);
    if (attachmentError) throw attachmentError;
    const { error } = await supabase.from("report_entries").update({ deleted_at: deletedAt }).eq("id", entryId);
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function captureSignature(input: { workOrderId: string; signerName: string; dataUrl: string; reportVersion: number }): Promise<ActionResult> {
  try {
    const context = await staffContext(["rapportage"]);
    const parsed = z.object({ workOrderId: z.string().uuid(), signerName: z.string().trim().min(2).max(120), dataUrl: z.string().startsWith("data:image/png;base64,"), reportVersion: z.number().int().positive() }).parse(input);
    const bytes = Buffer.from(parsed.dataUrl.split(",")[1], "base64");
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("Ongeldige handtekening");
    const signatureId = randomUUID();
    const path = `${context.tenant.id}/${parsed.workOrderId}/${signatureId}.png`;
    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage.from("signatures").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase.from("signatures").insert({ id: signatureId, tenant_id: context.tenant.id, work_order_id: parsed.workOrderId, captured_by: context.user.id, signer_name: parsed.signerName, storage_path: path, sha256: createHash("sha256").update(bytes).digest("hex"), report_version: parsed.reportVersion });
    if (error) { await supabase.storage.from("signatures").remove([path]); throw error; }
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function toggleShiftInterest(input: { shiftId: string; personnelId: string; interested: boolean }): Promise<ActionResult> {
  try {
    const context = await staffContext();
    const parsed = z.object({ shiftId: z.string().uuid(), personnelId: z.string().uuid(), interested: z.boolean() }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("shift_interests").upsert({ tenant_id: context.tenant.id, open_shift_id: parsed.shiftId, personnel_id: parsed.personnelId, status: parsed.interested ? "interested" : "withdrawn" }, { onConflict: "tenant_id,open_shift_id,personnel_id" });
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

export async function requestTimeCorrection(input: { timeEntryId: string; reason: string }): Promise<ActionResult> {
  try {
    await staffContext();
    const parsed = z.object({ timeEntryId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("time_entries").update({ status: "correction_requested", correction_reason: parsed.reason }).eq("id", parsed.timeEntryId);
    if (error) throw error;
    revalidatePath("/staff"); revalidatePath("/app"); return { ok: true };
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
