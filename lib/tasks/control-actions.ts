"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { targetSelectionSchema } from "./execution-config";
import type { ItemContext, TaskControlContext } from "./controls-model";
import type { ActionResult } from "@/lib/actions/result";
const common = {mutationId:z.uuid()};
const controlCommand = z.discriminatedUnion("action",[
 z.object({...common,action:z.literal("scope_price_accept"),taskId:z.uuid(),version:z.number().int().positive(),reason:z.string().trim().min(5).max(2000)}).strict(),
 z.object({...common,action:z.literal("item_save"),id:z.uuid().optional(),version:z.number().int().positive().optional(),customerId:z.uuid(),objectId:z.uuid(),nodeId:z.uuid().optional(),name:z.string().trim().min(1).max(180),itemType:z.string().trim().min(1).max(100),brand:z.string().max(100),model:z.string().max(100),serialNumber:z.string().max(200),status:z.enum(["active","out_of_service","archived"]).optional(),replacesId:z.uuid().optional(),duplicatesReviewed:z.boolean()}).strict(),
 z.object({...common,action:z.literal("targets_add"),taskId:z.uuid(),version:z.number().int().positive(),targets:z.array(targetSelectionSchema).min(1).max(500),reason:z.string().trim().min(5).max(2000)}).strict(),
 z.object({...common,action:z.literal("target_result"),taskId:z.uuid(),targetId:z.uuid(),version:z.number().int().positive(),state:z.enum(["in_progress","completed","not_done","not_applicable"]),outcome:z.enum(["pass","deviation","rejected","followup"]).optional(),followup:z.enum(["none","review","repair_proposal","followup_order"]),finding:z.string().max(3000),reason:z.string().max(2000),attachmentId:z.uuid().optional(),identified:z.boolean(),customerVisible:z.boolean()}).strict(),
 z.object({...common,action:z.enum(["target_recheck","target_withdraw"]),taskId:z.uuid(),targetId:z.uuid(),version:z.number().int().positive(),reason:z.string().trim().min(5).max(2000)}).strict(),
]);
export type TaskControlCommand = z.input<typeof controlCommand>;
function failure(error:unknown):{ok:false;error:string} {
 if(error instanceof z.ZodError)return {ok:false,error:error.issues[0]?.message??"Controleer je invoer."};
 const e=error as {code?:string;message?:string};
 return {ok:false,error:e.code==="40001"?"Deze gegevens zijn gewijzigd. Je invoer blijft behouden; vernieuw en vergelijk de actuele versie.":e.code==="23505"?"Dit doel is al gekoppeld. Vernieuw de taak.":["23514","42501"].includes(e.code??"")?e.message??"Geen toegang.":"Opslaan kon niet worden bevestigd. Je invoer blijft behouden; controleer je verbinding en probeer opnieuw."};
}
async function context(){const {tenant}=await getAuthContext();if(!tenant?.enabledServices.includes("planning"))throw new Error("Geen toegang");return tenant;}
export async function loadTaskControls(taskId:string,offset=0,query=""):Promise<ActionResult<{data:TaskControlContext}>>{
 try{const tenant=await context(),db=await createClient();const {data,error}=await db.rpc("task_control_context",{target_tenant:tenant.id,target_task:z.uuid().parse(taskId),page_offset:z.number().int().min(0).max(10000).parse(offset),query:z.string().max(200).parse(query)});if(error)throw error;return{ok:true,data:data as unknown as TaskControlContext};}catch{return{ok:false,error:"De taakdoelen konden niet worden geladen. Controleer je toegang en verbinding."};}
}
export async function loadTaskItems(objectId:string,query="",offset=0):Promise<ActionResult<{data:ItemContext}>>{
 try{const tenant=await context(),db=await createClient();const {data,error}=await db.rpc("task_item_context",{target_tenant:tenant.id,target_object:z.uuid().parse(objectId),query:z.string().max(200).parse(query),page_offset:z.number().int().min(0).max(100000).parse(offset)});if(error)throw error;return{ok:true,data:data as unknown as ItemContext};}catch{return{ok:false,error:"De items konden niet worden geladen. Controleer je toegang en verbinding."};}
}
export async function saveTaskControl(input:TaskControlCommand):Promise<ActionResult<{id:string;version:number}>>{
 try{const tenant=await context(),value=controlCommand.parse(input),db=await createClient();const {data,error}=await db.rpc("task_control_command",{target_tenant:tenant.id,input:value});if(error)throw error;revalidatePath("/app","layout");revalidatePath("/staff","layout");return{ok:true,...data as {id:string;version:number}};}catch(error){return failure(error);}
}
export async function loadTaskItemDossier(itemId:string,orderId?:string):Promise<ActionResult<{data:import("./controls-model").ItemDossier}>>{
 try{const tenant=await context(),db=await createClient();const {data,error}=await db.rpc("task_item_dossier",{target_tenant:tenant.id,target_item:z.uuid().parse(itemId),...(orderId?{target_order:z.uuid().parse(orderId)}:{})});if(error)throw error;return{ok:true,data:data as unknown as import("./controls-model").ItemDossier};}catch{return{ok:false,error:"Dit itemdossier is niet beschikbaar binnen je actuele toegang."};}
}
export type ScanMatch={taskId:string;taskName:string;targetId:string;itemId:string;number:string;name:string};
export async function findWorkOrderScan(orderId:string,identity:string):Promise<ActionResult<{data:ScanMatch[]}>>{
 try{const tenant=await context(),db=await createClient();const r=await db.rpc("task_scan_context",{target_tenant:tenant.id,target_order:z.uuid().parse(orderId),identity:z.string().trim().min(1).max(200).parse(identity)});if(r.error)throw r.error;return{ok:true,data:r.data as unknown as ScanMatch[]};}catch{return{ok:false,error:"Dit item is niet beschikbaar op deze werkbon binnen je actuele toegang."};}
}
