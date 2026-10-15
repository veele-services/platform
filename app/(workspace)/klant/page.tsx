import type { Metadata } from "next";
import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ProductBrand } from "@/components/fieldgrid/brand";
import { CustomerPortalController } from "@/components/fieldgrid/customer-portal/controller";
import { getObjectActor } from "@/lib/objects/auth";
import { getCustomerPortal,getCustomerPortalCoreSnapshot } from "@/lib/customer-portal/data";
import { CustomerSnapshotError } from "@/lib/customer-portal/snapshot-model";
import { customerRouteHref,customerRouteSchema } from "./route-model";

export const metadata:Metadata={title:"Klantportaal",robots:{index:false,follow:false}};
export default async function CustomerPortalPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const parsed=customerRouteSchema.safeParse(await searchParams);
 if(!parsed.success)notFound();
 const route=parsed.data;
 const actor=await getObjectActor().catch(()=>null);
 if(!actor)redirect(`/login?${new URLSearchParams({next:customerRouteHref(route)})}`);
 const identity=await getCustomerPortal().catch(()=>null);
 if(!identity)return <CustomerAccessState title="Je klantgegevens zijn tijdelijk niet beschikbaar" description="We konden je actuele toegang niet controleren. Probeer opnieuw; er is geen ander klantaccount geopend." href={customerRouteHref(route)}/>;
 if(route.account&&!identity.accounts.some(account=>account.id===route.account))return <CustomerAccessState title="Geen toegang tot dit klantaccount" description="Kies een van de klantaccounts die expliciet aan jou zijn gekoppeld." href="/klant"/>;
 const accountId=route.account??identity.workspace?.account.id;
 if(!accountId)return <main className="auth-page"><section className="auth-card"><ProductBrand/><span className="eyebrow">KLANTPORTAAL</span><h1>{identity.accounts.length?"Kies je klantomgeving":"Nog geen klanttoegang"}</h1><p>{identity.accounts.length?"Deze klantaccounts zijn expliciet aan jou gekoppeld. Kies de organisatie waarvoor je verder wilt gaan.":"Vraag je contactpersoon om je klantaccount expliciet te koppelen."}</p>{identity.accounts.map(account=><Link className="secondary-button" key={account.id} href={customerRouteHref({account:account.id,view:route.view})}>{account.name}</Link>)}<form action="/auth/signout" method="post"><button className="secondary-button">Uitloggen</button></form></section></main>;
 const snapshot=await getCustomerPortalCoreSnapshot(accountId).catch(error=>error instanceof CustomerSnapshotError?error:null);
 if(snapshot instanceof CustomerSnapshotError||!snapshot){const denied=snapshot instanceof CustomerSnapshotError&&snapshot.status===403;return <CustomerAccessState title={denied?"Je klanttoegang is gewijzigd":"Je actuele gegevens konden niet worden geladen"} description={denied?"Dit klantaccount is niet meer beschikbaar. Kies opnieuw of vraag je contactpersoon om toegang.":"Probeer de gegevens opnieuw te laden. Je wordt niet naar een andere organisatie doorgestuurd."} href={denied?"/klant":customerRouteHref({...route,account:accountId})}/>;}
 if(route.object&&!snapshot.workspace.objects.some(object=>object.id===route.object))notFound();
 if(route.order&&!snapshot.workspace.visits.some(visit=>visit.id===route.order&&(!route.object||visit.objectId===route.object)))notFound();
 if(route.ticket&&!snapshot.tickets.some(ticket=>ticket.id===route.ticket))notFound();
 if(route.request&&!snapshot.requests.some(request=>request.id===route.request||request.parts.some(part=>part.id===route.request)))notFound();
 if(route.invoice&&!snapshot.invoices.some(invoice=>invoice.id===route.invoice))notFound();
 if(route.report&&!snapshot.reports.some(report=>report.id===route.report))notFound();
 if(route.news&&!snapshot.news.some(news=>news.id===route.news))notFound();
 return <CustomerPortalController key={`${identity.tenantId}:${identity.actorKey}:${accountId}`} initial={snapshot} tenantId={identity.tenantId} actorKey={identity.actorKey} accounts={identity.accounts} initialView={route.view??"dashboard"} initialObject={route.order?undefined:route.object} initialVisit={route.order} initialTicket={route.ticket} initialRequest={route.request} initialInvoice={route.invoice} initialReport={route.report} initialNews={route.news} paymentReturn={route.payment==="return"}/>;
}

function CustomerAccessState({title,description,href}:{title:string;description:string;href:string}){
 return <main className="auth-page"><section className="auth-card"><ProductBrand/><span className="eyebrow">KLANTPORTAAL</span><h1>{title}</h1><p role="alert">{description}</p><Link className="primary-button" href={href}>Opnieuw controleren</Link><form action="/auth/signout" method="post"><button className="secondary-button">Uitloggen</button></form></section></main>;
}
