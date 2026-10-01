import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getObjectActor} from "@/lib/objects/auth";
import {brandThemeStyle} from "@/lib/branding/palette";
import {objectDate,type VisitContext} from "@/lib/objects/model";
import {ObjectVisit} from "@/components/fieldgrid/objects/visit";
import {FieldgridBrand} from "@/components/fieldgrid/brand";
import {NotificationBell} from "@/components/fieldgrid/notifications/inbox";
import {NotificationNavigation} from "@/components/fieldgrid/notifications/navigation";

type CustomerObject={id:string;name:string;number:string;manageSecrets:boolean;visits:Array<{id:string;number:string;start:string|null;end:string|null;status:string;service:string}>};
export default async function CustomerVisits({searchParams}:{searchParams:Promise<{object?:string;order?:string}>}){
 const actor=await getObjectActor().catch(()=>null);if(!actor)redirect("/login?next=/klant");const {db,admin,tenant}=actor;
 const {data,error}=await db.rpc("customer_object_visits",{target_tenant:tenant.id});if(error)throw new Error("Je afspraken konden niet worden geladen.");const objects=data as unknown as CustomerObject[];
 const query=await searchParams;const object=objects.find(o=>o.id===query.object);if(query.object&&!object)notFound();if(query.order&&!object?.visits.some(v=>v.id===query.order))notFound();
 const {data:brand}=await admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id",tenant.id).maybeSingle();
 let context:VisitContext|null=null;if(object){const r=await db.rpc("object_visit_context",{target_tenant:tenant.id,target_object:object.id,target_order:query.order});if(r.error)notFound();context=r.data as unknown as VisitContext;}
 return <main className="object-portal" style={brandThemeStyle(brand?.primary_color,brand?.accent_color)}><div className="object-portal-brand"><FieldgridBrand tenantName={tenant.name} logoUrl={brand?.logo_path?`/api/branding/${tenant.id}/email-logo`:null}/><div className="nt-actions"><NotificationNavigation workspace="customer" actorKey={`${tenant.id}:${actor.user.id}`}/><NotificationBell workspace="customer" actorKey={`${tenant.id}:${actor.user.id}`}/></div><form action="/auth/signout" method="post"><button className="secondary-button">Uitloggen</button></form></div>{context?<ObjectVisit context={context} timezone={tenant.timezone} customerMode manageSecrets={object?.manageSecrets}/>:<div className="object-dossier"><header className="page-intro"><span className="eyebrow">KLANTOMGEVING</span><h1>Mijn afspraken</h1><Link className="secondary-button" href="/klant/aanvragen">Mijn aanvragen en offertes</Link><Link className="secondary-button" href="/klant/documenten">Mijn documenten en facturen</Link><p>Kies de concrete afspraak waarvoor je iets wilt doorgeven.</p></header>{objects.map(o=><section className="dossier-card" key={o.id}><h2>{o.name}</h2><small>{o.number}</small>{o.visits.map(w=><Link className="dossier-event" key={w.id} href={`/klant?object=${o.id}&order=${w.id}`}><div><strong>{w.number} · {w.service}</strong><small>{objectDate(w.start,tenant.timezone)}</small></div><span>Afspraak openen →</span></Link>)}{!o.visits.length&&<p>Er zijn nog geen afspraken.</p>}{o.manageSecrets&&<Link className="secondary-button" href={`/klant?object=${o.id}`}>Beveiligde objectgegevens beheren</Link>}</section>)}{!objects.length&&<section className="dossier-card"><h2>Nog geen objecten gekoppeld</h2><p>Vraag je contactpersoon om jouw account expliciet aan het juiste object te koppelen.</p></section>}</div>}</main>;
}
