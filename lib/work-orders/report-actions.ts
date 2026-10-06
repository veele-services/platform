"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { reportRpc } from "./report-rpc";
import { getWorkOrderDossier } from "./data";
import type { WorkOrderDossier } from "./model";
import type { WorkOrderReport } from "./report-model";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";

async function context(){const actor=await getAuthContext();if(!actor.tenant||!actor.tenant.enabledServices.includes("rapportage"))throw new Error("Geen rapporttoegang");return actor;}
function refresh(){revalidatePath("/app","layout");revalidatePath("/staff","layout");revalidatePath("/klant","layout");}
export async function loadWorkOrderReport(orderId:string):Promise<ActionResult<{data:WorkOrderReport}>>{
 try{await context();const db=await createClient();const data=await reportRpc(db,"work_order_report",{target_work_order_id:z.uuid().parse(orderId)});return {ok:true,data:data as WorkOrderReport};}catch(e){return {ok:false,error:message(e)};}
}
export async function loadReportReviewDossier(orderId:string):Promise<ActionResult<{data:WorkOrderDossier}>>{
 try{const actor=await context();if(!actor.tenant?.roles.some(role=>["tenant_admin","management","finance"].includes(role)))throw new Error("Geen rapportcontrolerecht");const data=await getWorkOrderDossier(actor.tenant.id,z.uuid().parse(orderId));if(!data?.canReview)throw new Error("Geen actuele rapportcontrolerecht");return {ok:true,data};}catch(e){return {ok:false,error:message(e)};}
}
export async function submitWorkOrderReport(input:{orderId:string;version:number;summary:string;idempotencyKey:string}):Promise<ActionResult>{
 try{const actor=await context();if(!actor.tenant?.roles.includes("staff"))throw new Error("Personeelsuitvoering vereist");const v=z.object({orderId:z.uuid(),version:z.number().int().positive(),summary:z.string().trim().min(3).max(5000),idempotencyKey:z.uuid()}).parse(input);
 await reportRpc(await createClient(),"submit_work_order_report",{target_work_order_id:v.orderId,expected_version:v.version,summary:v.summary,idempotency_key:v.idempotencyKey});refresh();return {ok:true};}catch(e){return {ok:false,error:message(e)};}
}
export async function reviewWorkOrderReport(input:{orderId:string;reportId:string;decision:"approved"|"returned";reason:string}):Promise<ActionResult>{
 try{await context();const v=z.object({orderId:z.uuid(),reportId:z.uuid(),decision:z.enum(["approved","returned"]),reason:z.string().trim().max(2000)}).parse(input);
 await reportRpc(await createClient(),"review_work_order_report",{target_work_order_id:v.orderId,target_report_id:v.reportId,decision:v.decision,reason:v.reason});refresh();return {ok:true};}catch(e){return {ok:false,error:message(e)};}
}
export async function waiveWorkOrderSignature(input:{reportId:string;reason:string}):Promise<ActionResult>{
 try{await context();const v=z.object({reportId:z.uuid(),reason:z.string().trim().min(5).max(1000)}).parse(input);await reportRpc(await createClient(),"waive_work_order_signature",{target_report_id:v.reportId,reason:v.reason});refresh();return {ok:true};}catch(e){return {ok:false,error:message(e)};}
}
export async function changeWorkOrderSignaturePolicy(input:{orderId:string;version:number;mode:string;employeeRequired:boolean;reason:string;mutationId:string}):Promise<ActionResult>{
 try{await context();const v=z.object({orderId:z.uuid(),version:z.number().int().positive(),mode:z.enum(["inherit","none","optional","required"]),employeeRequired:z.boolean(),reason:z.string().trim().min(5).max(2000),mutationId:z.uuid()}).parse(input);
 await reportRpc(await createClient(),"change_work_order_signature_policy",{target_order:v.orderId,expected_version:v.version,mode:v.mode,employee_required:v.employeeRequired,reason:v.reason,mutation_id:v.mutationId});refresh();return {ok:true};}catch(e){return {ok:false,error:message(e)};}
}
