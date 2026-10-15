import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getPlanningShellData } from "@/lib/planning/data";
import { canManageObjects } from "@/lib/objects/model";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import {SitesObjectsList} from '@/components/fieldgrid/management-cockpit/objects-list';
import {hasManagementPermission} from '@/lib/management/model';
import {PageHeading,Panel,Empty} from '@/components/fieldgrid/crm/ui';
import { operationalOrderRows } from "@/lib/work-orders/operational-data";

// Search/filter must include more than PostgREST's default first 1,000 rows.
async function allRows<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){
 const data:T[]=[];
 for(let from=0;;from+=500){const result=await page(from,from+499);if(result.error)throw new Error("De objectenlijst kon niet volledig worden geladen.");data.push(...result.data??[]);if((result.data?.length??0)<500)return {data,error:null};}
}

export default async function ObjectsPage({searchParams}:{searchParams:Promise<{record?:string;customer?:string;new?:string}>}){
 const context=await getAuthContext();if(!context.tenant||!canManageObjects(context.tenant.roles)||!context.tenant.enabledServices.includes("planning"))notFound();
 const query=await searchParams;if(query.record&&/^[a-f0-9-]{36}$/i.test(query.record))redirect(`/app/objecten/${query.record}`);
 const db=await createClient();const tenant=context.tenant;
 if(!hasManagementPermission(tenant,'backoffice.functions.cockpit_entity_query'))return <BackofficeShell context={{...context,tenant}} initialView="objecten" data={await getPlanningShellData(tenant.id)} presentation="sites-management"><PageHeading eyebrow="LOCATIES" title="Objecten"/><Panel><Empty title="Deze weergave is afgeschermd" text="Je actuele rechten geven geen toegang tot deze lijst- en dossierweergave."/></Panel></BackofficeShell>;
 const canWork=hasManagementPermission(tenant,'backoffice.work_orders.read')&&hasManagementPermission(tenant,'backoffice.functions.work_order_operational_rows');
 const [objects,customers,orders,records,requests,shell]=await Promise.all([
 allRows((from,to)=>db.from("objects").select("*").eq("tenant_id",tenant.id).order("name").order("id").range(from,to)),allRows((from,to)=>db.from("customers").select("*").eq("tenant_id",tenant.id).order("name").order("id").range(from,to)),
 canWork?operationalOrderRows(db,tenant.id,{all:true}):Promise.resolve({data:[],error:null}),
 allRows((from,to)=>db.from("object_records").select("object_id,kind,state,service").eq("tenant_id",tenant.id).order("id").range(from,to)),allRows((from,to)=>db.from("object_visit_requests").select("object_id,needs_review").eq("tenant_id",tenant.id).eq("needs_review",true).order("id").range(from,to)),getPlanningShellData(tenant.id)]);
 if([objects,customers,orders,records,requests].some(r=>r.error))throw new Error("De objectenlijst kon niet volledig worden geladen.");
 return <BackofficeShell context={{...context,tenant}} initialView="objecten" data={shell} presentation="sites-management"><SitesObjectsList tenant={tenant} objects={objects.data??[]} customers={customers.data??[]} orders={orders.data??[]} records={records.data??[]} requests={requests.data??[]} initialCustomer={query.customer??""} create={query.new==="1"} canWork={canWork}/></BackofficeShell>;
}
