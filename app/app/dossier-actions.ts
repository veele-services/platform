"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/result";
import type { ChainScope, DossierChain } from "@/lib/dossiers/model";

const scopeSchema = z.object({ customerId: z.uuid().optional(), objectId: z.uuid().optional(), personnelId: z.uuid().optional(), orderId: z.uuid().optional() });
export async function getDossierChain(scope: ChainScope): Promise<ActionResult<{ data: DossierChain }>> {
  try {
    const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const s = scopeSchema.parse(scope); const db = await createClient();
    const { data, error } = await db.rpc("dossier_chain", { target_tenant: context.tenant.id, target_customer: s.customerId, target_object: s.objectId, target_personnel: s.personnelId, target_order: s.orderId });
    if (error || !data) throw new Error();
    return { ok: true, data: data as unknown as DossierChain };
  } catch { return { ok: false, error: "De gekoppelde dossiers zijn niet beschikbaar. Controleer je toegang en probeer opnieuw." }; }
}
export async function saveCustomerAgreement(form: FormData): Promise<ActionResult> {
  try {
    const context = await getAuthContext();
    if (!context.tenant || !context.tenant.roles.some(r => ["tenant_admin", "management", "finance"].includes(r))) throw new Error();
    const v = z.object({ id: z.uuid(), customerId: z.uuid(), previousId: z.uuid().or(z.literal("")), title: z.string().trim().min(2).max(180), startsOn: z.iso.date(), endsOn: z.iso.date().or(z.literal("")), acceptedBy: z.string().trim().min(2).max(180), acceptedOn: z.iso.date(), documentId: z.uuid(), lineCount: z.coerce.number().int().min(1).max(100) }).parse(Object.fromEntries(form));
    const lineSchema=z.object({objectId:z.uuid(),taskRevisionId:z.uuid(),scope:z.string().trim().min(2).max(3000),quantity:z.coerce.number().positive(),price:z.coerce.number().nonnegative(),limit:z.coerce.number().nonnegative()});
    const lines=Array.from({length:v.lineCount},(_,i)=>{const l=lineSchema.parse(Object.fromEntries(["objectId","taskRevisionId","scope","quantity","price","limit"].map(key=>[key,form.get(`${key}-${i}`)])));return {...l,priceCents:Math.round(l.price*100),limitCents:Math.round(l.limit*100)};});
    const db = await createClient();
    const { error } = await db.rpc("record_customer_agreement", { target_tenant: context.tenant.id, target_customer: v.customerId, input: { ...v, lines } });
    if (error) return { ok: false, error: "Controleer de nieuwste versie, het akkoordbewijs en de prijs-/hoeveelheidslimiet. Herlaad bij een gelijktijdige wijziging." };
    revalidatePath("/app", "layout"); return { ok: true };
  } catch { return { ok: false, error: "De afspraak is niet opgeslagen. Controleer de verplichte gegevens en je toegang." }; }
}
export async function recordTaskExecution(form: FormData): Promise<ActionResult> {
  try {
    const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const v = z.object({ taskId: z.uuid(), version: z.coerce.number().int().positive(), result: z.enum(["in_progress", "completed", "partial", "not_done", "not_applicable"]), quantity: z.coerce.number().min(0), reason: z.string().max(3000) }).parse(Object.fromEntries(form));
    const db = await createClient(); const { error } = await db.rpc("record_task_execution", { target_tenant: context.tenant.id, target_task: v.taskId, expected_version: v.version, result: v.result, actual_quantity: v.quantity, reason: v.reason });
    if (error) return { ok: false, error: "Controleer de actuele toewijzing, hoeveelheid en status. Herlaad als iemand anders de uitvoering heeft bijgewerkt." };
    revalidatePath("/staff", "layout"); revalidatePath("/app", "layout"); return { ok: true };
  } catch { return { ok: false, error: "Uitvoering niet opgeslagen. Controleer je invoer." }; }
}
export async function getTaskCollaboration(taskId: string): Promise<ActionResult<{ data: TaskCollaboration }>> {
  try {
    const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const db = await createClient();
    const { data, error } = await db.rpc("work_order_task_context", { target_tenant: context.tenant.id, target_task: z.uuid().parse(taskId) });
    if (error || !data) throw new Error();
    return { ok: true, data: data as unknown as TaskCollaboration };
  } catch { return { ok: false, error: "Taakverdeling en bijdragen niet beschikbaar. Controleer je actuele toewijzing." }; }
}
export type TaskCollaboration = {
  assignedPersonnelId: string | null; canAssign: boolean;
  crew: Array<{ id: string; name: string }>;
  contributions: Array<{ id: string; actor: string; recordedAt: string; fromQuantity: number; toQuantity: number; result: string; note: string | null }>;
};
export async function assignWorkOrderTask(form: FormData): Promise<ActionResult> {
  try {
    const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const values = z.object({ taskId: z.uuid(), version: z.coerce.number().int().positive(), personnel: z.uuid().or(z.literal("")) }).parse(Object.fromEntries(form));
    const db = await createClient();
    const { error } = await db.rpc("assign_work_order_task", { target_tenant: context.tenant.id, target_task: values.taskId, expected_version: values.version, personnel: values.personnel || undefined });
    if (error) return { ok: false, error: "Kies iemand uit de actuele werkbonbezetting. Herlaad als de taak is gewijzigd." };
    revalidatePath("/app", "layout"); revalidatePath("/staff", "layout"); return { ok: true };
  } catch { return { ok: false, error: "Taakverdeling niet opgeslagen. Controleer je invoer en toegang." }; }
}
