import {redirect} from "next/navigation";
import Link from "next/link";
import {getObjectActor} from "@/lib/objects/auth";
import {brandThemeStyle} from "@/lib/branding/palette";
import {CustomerCommercial,type CustomerCommercialData} from "./view";
export default async function CustomerCommercialPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const actor=await getObjectActor().catch(()=>null);if(!actor)redirect("/login?next=/klant/aanvragen");const page=Math.max(1,Math.min(100000,Number((await searchParams).page)||1));const r=await actor.db.rpc("commercial_customer_list",{target_tenant:actor.tenant.id,page_number:page});if(r.error)throw new Error("Je aanvragen konden niet worden geladen.");const {data:b}=await actor.admin.from("tenant_branding").select("primary_color,accent_color").eq("tenant_id",actor.tenant.id).single();
 return <main className="object-portal" style={brandThemeStyle(b?.primary_color,b?.accent_color)}><header className="page-intro"><h1>Mijn aanvragen en offertes</h1><p>{actor.tenant.name}</p><Link className="secondary-button" href="/klant">Mijn afspraken</Link></header><CustomerCommercial data={r.data as unknown as CustomerCommercialData} timezone={actor.tenant.timezone}/><nav className="object-pagination" aria-label="Paginering">{page>1&&<Link href={`?page=${page-1}`}>Vorige pagina</Link>}<span>Pagina {page}</span>{((r.data as unknown as CustomerCommercialData).requests.length===25||(r.data as unknown as CustomerCommercialData).quotes.length===25)&&<Link href={`?page=${page+1}`}>Volgende pagina</Link>}</nav></main>;
}
