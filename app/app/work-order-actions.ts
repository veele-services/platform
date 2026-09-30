"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getWorkOrderList, getWorkOrderOptions } from "@/lib/work-orders/data";
import { saveWorkOrderSchema, workOrderQuery, type SaveWorkOrderInput, type WorkOrderQuery, type WorkOrderResult, type WorkTemplate, type ChecklistQuestion } from "@/lib/work-orders/model";
import type { Json } from "@/lib/database.types";
import type { SignatureSettings, WorkOrderExceptionData } from "@/lib/work-orders/model";

async function access(staff = false) {
  const { tenant } = await getAuthContext();
  if (!tenant?.enabledServices.includes("planning") || !tenant.roles.some(r => ["tenant_admin", "management", "planner", "finance", ...(staff ? ["staff"] : [])].includes(r))) throw new Error("Geen toegang tot werkbonnen.");
  return tenant;
}
function refreshOrders() { revalidatePath("/app", "layout"); revalidatePath("/staff"); revalidatePath("/klant", "layout"); }
function errorResult(error: unknown): WorkOrderResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message || "Controleer de ingevulde gegevens." };
  const e = error as { code?: string; message?: string };
  return { ok: false, code: e?.code, error: e?.code === "40001" ? "De werkbon is intussen gewijzigd. Bekijk de actuele versie en probeer opnieuw." : ["23514", "23P01"].includes(e?.code ?? "") ? e.message! : "Opslaan is niet gelukt. Controleer je toegang en probeer opnieuw; je invoer blijft bewaard." };
}
export async function loadWorkOrders(query: WorkOrderQuery) { const tenant = await access(); return getWorkOrderList(tenant.id, workOrderQuery.parse(query)); }
export async function loadWorkOrderOptions() { const tenant = await access(); return getWorkOrderOptions(tenant.id); }
export async function saveWorkOrder(input: SaveWorkOrderInput): Promise<WorkOrderResult> {
  try { const tenant = await access(); const value = saveWorkOrderSchema.parse(input); const db = await createClient();
    const { data, error } = await db.rpc("save_work_order", { target_tenant: tenant.id, input: value });
    if (error) throw error; const result = data as unknown as WorkOrderResult; if (result.ok) refreshOrders(); return result;
  } catch (e) { return errorResult(e); }
}
const mutation = z.object({ orderId: z.uuid(), version: z.number().int().positive(), mutationId: z.uuid(), action: z.enum(["publish", "archive", "cancel", "delete"]), reason: z.string().max(2000).optional() });
export async function mutateWorkOrder(input: z.infer<typeof mutation>): Promise<WorkOrderResult> {
  try { const tenant = await access(), db = await createClient(); const { data, error } = await db.rpc("mutate_work_order", { target_tenant: tenant.id, input: mutation.parse(input) }); if (error) throw error; refreshOrders(); return data as unknown as WorkOrderResult; } catch (e) { return errorResult(e); }
}
const questionSchema: z.ZodType<ChecklistQuestion> = z.object({ id: z.string().min(1).max(100), section: z.string().max(100), label: z.string().min(2).max(300), help: z.string().max(1000), type: z.enum(["check","boolean","choice","text","number","photo"]), options: z.array(z.string().max(200)).max(30), unit: z.string().max(40), required: z.boolean(), proof: z.boolean(), allowNA: z.boolean(), customerVisible: z.boolean(), condition: z.object({ questionId: z.string().min(1).max(100), equals: z.union([z.string().max(200), z.boolean()]) }).optional() });
const templateInput = z.object({ name: z.string().trim().min(2).max(180), kind: z.enum(["work_order", "checklist"]), revisionId: z.uuid().nullable(), editVersion: z.number().int().positive().optional(), definition: z.object({ discipline: z.string().max(100).optional(), requiredPersonnel: z.number().int().min(1).max(100).optional(), signatureMode: z.enum(["none", "optional", "required"]).optional(), employeeSignatureRequired: z.boolean().optional(), tasks: z.array(z.object({ revisionId: z.uuid(), quantity: z.number().positive().max(100000), instructions: z.string().max(2000).optional() })).max(100).optional(), questions: z.array(questionSchema).max(100).optional(), checklistRevisionIds: z.array(z.uuid()).max(20).optional() }) });
export async function mutateWorkTemplate(input: { commandId: string; command: "save" | "publish" | "archive" | "copy"; template: Omit<WorkTemplate, "id" | "version" | "state" | "revisionId"> & { revisionId: string | null } }): Promise<WorkOrderResult> {
  try { const tenant = await access(), db = await createClient(); const value = templateInput.parse(input.template); const { data, error } = await db.rpc("work_order_template_command", { target_tenant: tenant.id, command_id: z.uuid().parse(input.commandId), command: z.enum(["save","publish","archive","copy"]).parse(input.command), input: value as Json }); if (error) throw error; refreshOrders(); return data as unknown as WorkOrderResult; } catch (e) { return errorResult(e); }
}
const answer = z.object({ mutationId: z.uuid(), checklistId: z.uuid(), questionId: z.string().min(1).max(100), version: z.number().int().min(0), value: z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]), notApplicable: z.boolean(), reason: z.string().max(2000), attachmentId: z.uuid().nullable() });
export async function answerWorkOrderChecklist(input: z.infer<typeof answer>): Promise<WorkOrderResult> {
  try { const tenant = await access(true), db = await createClient(); const { data, error } = await db.rpc("answer_work_order_checklist", { target_tenant: tenant.id, input: answer.parse(input) }); if (error) throw error; refreshOrders(); return data as unknown as WorkOrderResult; } catch (e) { return errorResult(e); }
}
export async function readWorkOrderSignatureSettings(objectId?: string): Promise<{ ok: true; data: SignatureSettings } | { ok: false; error: string }> {
  try { const tenant = await access(), db = await createClient(); const r = await db.rpc("work_order_signature_settings", { target_tenant: tenant.id, target_object: objectId ? z.uuid().parse(objectId) : undefined }); if (r.error) throw r.error; return { ok: true, data: r.data as unknown as SignatureSettings }; } catch { return { ok: false, error: "De ondertekeninstellingen konden niet worden geladen." }; }
}
export async function saveWorkOrderSignatureSettings(input: { objectId?: string; mode: SignatureSettings['mode']; employeeRequired: boolean; allowWaivers: boolean; waiverUsers: string[] }): Promise<{ ok: true } | { ok: false; error: string }> {
  try { const tenant = await access(), db = await createClient(); const v = z.object({ objectId: z.uuid().optional(), mode: z.enum(["inherit","none","optional","required"]), employeeRequired: z.boolean(), allowWaivers: z.boolean(), waiverUsers: z.array(z.uuid()).max(100) }).parse(input); const r = await db.rpc("work_order_signature_settings", { target_tenant: tenant.id, target_object: v.objectId, input: v }); if (r.error) throw r.error; refreshOrders(); return { ok: true }; } catch (e) { return errorResult(e) as { ok: false; error: string }; }
}
export async function readWorkOrderExceptions(orderId: string): Promise<{ ok: true; data: WorkOrderExceptionData } | { ok: false; error: string }> {
  try { const tenant = await access(true), db = await createClient(); const r = await db.rpc("work_order_exceptions", { target_tenant: tenant.id, target_order: z.uuid().parse(orderId) }); if (r.error) throw r.error; return { ok: true, data: r.data as unknown as WorkOrderExceptionData }; } catch { return { ok: false, error: "De uitvoeringsmeldingen konden niet worden geladen." }; }
}
export async function saveWorkOrderException(input: { mutationId: string; action: "create" | "resolve"; orderId: string; id?: string; version?: number; kind?: string; description?: string; blocking?: boolean; attachmentId?: string; ownerId?: string; resolution?: string }): Promise<WorkOrderResult> {
  try { const tenant = await access(true), db = await createClient(); const value = z.object({ mutationId:z.uuid(), action:z.enum(["create","resolve"]), orderId:z.uuid(), id:z.uuid().optional(), version:z.number().int().positive().optional(), kind:z.enum(["no_access","absence","material","unsafe","damage","customer_cancelled","delay","other"]).optional(), description:z.string().min(3).max(3000).optional(), blocking:z.boolean().optional(), attachmentId:z.uuid().or(z.literal("")).optional(), ownerId:z.uuid().or(z.literal("")).optional(), resolution:z.string().min(3).max(3000).optional() }).parse(input); const r = await db.rpc("work_order_exception_command", { target_tenant: tenant.id, input:value }); if (r.error) throw r.error; refreshOrders(); return r.data as unknown as WorkOrderResult; } catch(e) { return errorResult(e); }
}
