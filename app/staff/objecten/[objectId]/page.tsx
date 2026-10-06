import {notFound} from "next/navigation";
import {getObjectActor} from "@/lib/objects/auth";
import {brandThemeStyle} from "@/lib/branding/palette";
import {SecureObjectVisit} from "@/components/fieldgrid/objects/secure-visit";
export default async function StaffObjectVisit({params,searchParams}:{params:Promise<{objectId:string}>;searchParams:Promise<{order?:string}>}){
 const {objectId}=await params;const {order}=await searchParams;if(!/^[a-f0-9-]{36}$/i.test(objectId)||!order||!/^[a-f0-9-]{36}$/i.test(order))notFound();
 const {admin,tenant}=await getObjectActor();
 const {data:brand}=await admin.from("tenant_branding").select("primary_color,accent_color").eq("tenant_id",tenant.id).maybeSingle();
 return <main className="object-portal" style={brandThemeStyle(brand?.primary_color,brand?.accent_color)}><SecureObjectVisit objectId={objectId} orderId={order} timezone={tenant.timezone}/></main>;
}
