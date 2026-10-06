"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { reportRpc } from "@/lib/work-orders/report-rpc";
import type { ActionResult } from "@/lib/actions/result";
import type { TaskCatalogueData } from "./model";

async function access(write = false) { const { tenant } = await getAuthContext(); if (!tenant?.enabledServices.includes("planning") || !tenant.roles.some(role => ["tenant_admin", "management", "planner", ...(!write ? ["finance"] : [])].includes(role))) throw new Error("Geen toegang tot taakbeheer."); return tenant; }
function failure(error: unknown): {ok:false;error:string} { const e = error as { code?: string; message?: string }; return { ok:false, error:e.code === "40001" ? "Deze gegevens zijn intussen gewijzigd. Vernieuw en probeer opnieuw." : e.code === "23505" ? "Deze naam of prefix bestaat al. Kies een andere." : ["23514","42501"].includes(e.code ?? "") ? e.message! : "Opslaan kon niet worden bevestigd. Je invoer blijft bewaard; probeer opnieuw." }; }
export async function loadTaskCatalogue(): Promise<ActionResult<{data:TaskCatalogueData}>> { try {const tenant=await access(); const data=await reportRpc(await createClient(),"task_catalogue",{target_tenant:tenant.id});return {ok:true,data:data as TaskCatalogueData};}catch{return {ok:false,error:"Taakbeheer kon niet worden geladen."};} }
const command = z.discriminatedUnion("action", [
 z.object({action:z.literal("category_save"),id:z.uuid().optional(),version:z.number().int().positive().optional(),name:z.string().trim().min(2).max(120),prefix:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/)}),
 z.object({action:z.literal("category_active"),id:z.uuid(),version:z.number().int().positive(),active:z.boolean()}),
 z.object({action:z.literal("task_active"),id:z.uuid(),version:z.number().int().positive(),active:z.boolean()}),
 z.object({action:z.literal("task_save"),id:z.uuid().optional(),version:z.number().int().positive().optional(),categoryId:z.uuid().optional(),name:z.string().trim().min(2).max(180),description:z.string().max(3000),discipline:z.string().trim().min(2).max(100),duration:z.number().int().min(1).max(1440),priceCents:z.number().int().nonnegative().optional(),vatBasisPoints:z.number().int().min(0).max(10000).optional(),extraWork:z.boolean(),requiresPhoto:z.boolean(),requiresSignature:z.boolean()}),
]);
export type CatalogueCommand = z.input<typeof command>;
export async function saveTaskCatalogue(input: CatalogueCommand & {mutationId:string}): Promise<ActionResult> { try {const tenant=await access(true);const payload={...command.parse(input),mutationId:z.uuid().parse(input.mutationId)};const db=await createClient();const{error}=await db.rpc("task_catalogue_command",{target_tenant:tenant.id,input:payload});if(error)throw error;revalidatePath("/app","layout");return {ok:true};}catch(e){if(e instanceof z.ZodError)return {ok:false,error:e.issues[0]?.message??"Controleer je invoer."};return failure(e);} }
