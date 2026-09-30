import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { reportRpc } from "./report-rpc";
type Client=Awaited<ReturnType<typeof createClient>>;
type Row<T extends keyof Database["public"]["Tables"]>=Database["public"]["Tables"][T]["Row"];
export async function operationalOrderRows(db:Client,tenant:string,options:{customerId?:string;objectId?:string;all?:boolean;openOnly?:boolean}={}){
 const data:Row<"work_orders">[]=[];
 for(let offset=0;;offset+=500){
  const batch=await reportRpc(db,"work_order_operational_rows",{target_tenant:tenant,target_customer:options.customerId??null,target_object:options.objectId??null,page_offset:offset,page_size:500,open_only:options.openOnly??false}) as Row<"work_orders">[];
  data.push(...batch);if(!options.all||batch.length<500)return {data,error:null};
 }
}
export async function operationalTaskData(db:Client,tenant:string){
 return await reportRpc(db,"work_order_operational_task_data",{target_tenant:tenant}) as {taskRevisions:Row<"task_revisions">[];workOrderTasks:Row<"work_order_tasks">[]};
}
