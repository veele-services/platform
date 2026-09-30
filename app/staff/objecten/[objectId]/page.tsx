import {notFound} from "next/navigation";
import {getObjectActor} from "@/lib/objects/auth";
import {brandThemeStyle} from "@/lib/branding/palette";
import type {VisitContext} from "@/lib/objects/model";
import {ObjectVisit} from "@/components/fieldgrid/objects/visit";
export default async function StaffObjectVisit({params,searchParams}:{params:Promise<{objectId:string}>;searchParams:Promise<{order?:string}>}){
 const {objectId}=await params;const {order}=await searchParams;if(!/^[a-f0-9-]{36}$/i.test(objectId)||!order||!/^[a-f0-9-]{36}$/i.test(order))notFound();
 const {db,admin,tenant}=await getObjectActor();const r=await db.rpc("object_visit_context",{target_tenant:tenant.id,target_object:objectId,target_order:order});if(r.error)notFound();
 const {data:brand}=await admin.from("tenant_branding").select("primary_color,accent_color").eq("tenant_id",tenant.id).maybeSingle();
 return <main className="object-portal" style={brandThemeStyle(brand?.primary_color,brand?.accent_color)}><ObjectVisit context={r.data as unknown as VisitContext} timezone={tenant.timezone}/></main>;
}
