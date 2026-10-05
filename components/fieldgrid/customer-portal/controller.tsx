"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { Download,Eye,Info } from "lucide-react";
import { ProductBrand } from "@/components/fieldgrid/brand";
import type { CustomerAccountOption } from "@/lib/customer-portal/model";
import { customerBaseSnapshotSchema } from "@/lib/customer-portal/model";
import type { CustomerCoreSnapshot } from "@/lib/customer-portal/snapshot-model";
import type { CustomerVisitDetail } from "@/lib/customer-portal/visit-model";
import { saveCustomerPortalProfile } from "@/lib/customer-portal/profile-action";
import { saveCustomerPortalObject } from "@/lib/customer-portal/object-action";
import { saveCustomerPortalPreferences } from "@/lib/customer-portal/preferences-action";
import { saveCustomerPortalOnboarding } from "@/lib/customer-portal/onboarding-action";
import { addCustomerPortalInstruction } from "@/lib/customer-portal/instruction-action";
import { createCustomerPortalRequest } from "@/lib/customer-portal/request-action";
import { saveCustomerCommercial } from "@/lib/customer-portal/commercial-action";
import { readCustomerPortalActivity } from "@/lib/customer-portal/activity-action";
import { saveCustomerTicket } from "@/lib/customer-portal/ticket-action";
import { CustomerCommercialDetail } from "./commercial-detail";
import { CustomerTicketDialog } from "./tickets";
import { CustomerPaymentDialog } from "./payment";
import { markCustomerPortalNews } from "@/lib/customer-portal/news-action";
import { customerCoreAvailability,customerCoreResources,customerPortalViewSchema,customerRouteHref,loadCustomerVisit,type CustomerPortalView } from "@/app/klant/route-model";
import { CustomerPortal,type CustomerPortalActions } from "./portal";
import { CustomerDialog } from "./dialog";
import { CustomerObjectForm } from "./forms";
import { CustomerObjectDetail } from "./object-detail";
import { CustomerPreferencesForm } from "./preferences";
import { CustomerOnboarding } from "./onboarding";
import { CustomerServiceRequestForm,CustomerRequestDetail } from "./requests";
import { CustomerVisitDetailDialog,CustomerReportBody } from "./visit-detail";
import { CustomerNewsDetailDialog } from "./news-detail";
import { useCustomerRefresh } from "./use-customer-refresh";
import { customerInvoiceLabel,customerDate } from "@/lib/customer-portal/presentation";
import { money } from "@/lib/commercial/model";

type Modal={kind:"object"|"editObject"|"report"|"invoice"|"requestDetail"|"news"|"commercial";id:string}|{kind:"visit";id:string;notes:boolean}|{kind:"newObject"|"preferences"|"onboarding"}|{kind:"request";service?:string;objectId?:string}|{kind:"payment";ids:string[]}|{kind:"ticket";id?:string;route?:"tenant"|"platform"}|{kind:"message";title:string;body:string};
type VisitState={id:string;detail:CustomerVisitDetail|null;error:string;loading:boolean};
/** The server keys this controller by tenant, verified session and selected
 * account. No customer/tenant selector is read from browser storage. */
export function CustomerPortalController({initial,tenantId,actorKey,accounts,initialView,initialObject,initialVisit,initialTicket,initialRequest,initialInvoice,initialReport,initialNews,paymentReturn=false}:{initial:CustomerCoreSnapshot;tenantId:string;actorKey:string;accounts:CustomerAccountOption[];initialView:CustomerPortalView;initialObject?:string;initialVisit?:string;initialTicket?:string;initialRequest?:string;initialInvoice?:string;initialReport?:string;initialNews?:string;paymentReturn?:boolean}){
 const router=useRouter(),[seed]=useState(initial),state=useCustomerRefresh(seed,tenantId,actorKey),{snapshot,refresh}=state;
 const [view,setView]=useState<CustomerPortalView>(initialView),[modal,setModal]=useState<Modal|null>(()=>initialTicket?{kind:"ticket",id:initialTicket}:initialRequest?{kind:initial.requests.some(request=>request.id===initialRequest)?"requestDetail":"commercial",id:initialRequest}:initialInvoice?{kind:"invoice",id:initialInvoice}:initialReport?{kind:"report",id:initialReport}:initialNews?{kind:"news",id:initialNews}:initialVisit?{kind:"visit",id:initialVisit,notes:false}:initialObject?{kind:"object",id:initialObject}:!initial.workspace.account.onboardingCompletedAt&&initial.workspace.account.canCreateObjects&&initial.workspace.account.canEditProfile&&initial.workspace.tenant.planning?{kind:"onboarding"}:null);
 const [showPaymentReturn,setShowPaymentReturn]=useState(paymentReturn);
 const [visitState,setVisitState]=useState<VisitState|null>(null),[visitRevision,setVisitRevision]=useState(0);
 const visitId=modal?.kind==="visit"?modal.id:null,accountId=seed.workspace.account.id;
 useEffect(()=>{
  const update=()=>{const location=new URL(window.location.href);if(location.searchParams.get("account")!==accountId)return;const next=customerPortalViewSchema.safeParse(location.searchParams.get("view")??"dashboard");if(next.success)setView(next.data);};
  window.addEventListener("popstate",update);return()=>window.removeEventListener("popstate",update);
 },[accountId]);
 useEffect(()=>{
  if(!visitId||!snapshot)return;
  const abort=new AbortController();
  const load=async()=>{
   try{const result=await loadCustomerVisit(accountId,visitId,abort.signal);if(abort.signal.aborted)return;
    if(result.kind==="ok"){setVisitState({id:visitId,detail:result.detail,error:"",loading:false});return;}
    if(result.kind==="denied"){setVisitState({id:visitId,detail:null,error:"Deze afspraak is gewijzigd of niet meer toegankelijk.",loading:false});void refresh();return;}
    setVisitState(previous=>({id:visitId,detail:previous?.id===visitId?previous.detail:null,error:"De actuele afspraak kon niet worden gecontroleerd. Probeer opnieuw.",loading:false}));
   }catch{if(!abort.signal.aborted)setVisitState(previous=>({id:visitId,detail:previous?.id===visitId?previous.detail:null,error:"De actuele afspraak kon niet worden geladen.",loading:false}));}
  };
  void load();return()=>abort.abort();
 },[accountId,visitId,snapshot,visitRevision,refresh]);
 if(!snapshot)return <main className="auth-page"><section className="auth-card"><ProductBrand/><span className="eyebrow">KLANTPORTAAL</span><h1>Je klanttoegang is gewijzigd</h1><p role="alert">De privégegevens zijn uit dit venster verwijderd. Controleer je toegang opnieuw of vraag je contactpersoon om hulp.</p><Link className="primary-button" href="/klant">Toegang opnieuw controleren</Link><form action="/auth/signout" method="post"><button className="secondary-button">Uitloggen</button></form></section></main>;
 const {workspace}=snapshot,resources=customerCoreResources(snapshot),close=()=>setModal(null);
 const unavailable=(title:string,body:string)=>setModal({kind:"message",title,body});
 const ticket=()=>setModal({kind:"ticket",route:"tenant"});
 const saved=async<T extends {ok:boolean}>(operation:Promise<T>)=>{const result=await operation;if(result.ok)await refresh();return result;};
 const openVisit=(id:string,notes=false)=>{if(!workspace.visits.some(visit=>visit.id===id))return;setVisitState({id,detail:null,error:"",loading:true});setModal({kind:"visit",id,notes});};
 const actions:CustomerPortalActions={
  navigate:next=>{setModal(null);setView(next);window.history.replaceState(null,"",customerRouteHref({account:accountId,view:next}));},
  openObject:id=>{if(workspace.objects.some(object=>object.id===id))setModal({kind:"object",id});},newObject:()=>setModal({kind:"newObject"}),openVisit,
  openReport:report=>{if(resources.reports.some(current=>current.id===report.id))setModal({kind:"report",id:report.id});},
  openInvoice:invoice=>{if(resources.invoices.some(current=>current.id===invoice.id))setModal({kind:"invoice",id:invoice.id});},
  request:(service,objectId)=>setModal({kind:"request",service,objectId}),openRequest:id=>{if(resources.requests.some(request=>request.id===id))setModal({kind:"requestDetail",id});},
  newTicket:route=>setModal({kind:"ticket",route}),openTicket:id=>{if(resources.tickets.some(ticket=>ticket.id===id))setModal({kind:"ticket",id});},openNews:news=>{if(resources.news.some(current=>current.id===news.id))setModal({kind:"news",id:news.id});},
  openActivity:activity=>{void (async()=>{const result=await saved(readCustomerPortalActivity({accountId,notificationId:activity.id,version:activity.version,operation:"read",commandId:crypto.randomUUID()}));if(!result.ok){unavailable("Melding niet bijgewerkt",result.error);return;}if(activity.targetPath){const url=new URL(activity.targetPath,window.location.origin);if(url.pathname==="/klant"&&url.searchParams.get("account")===accountId){router.push(activity.targetPath);const next=customerPortalViewSchema.safeParse(url.searchParams.get("view"));if(next.success)setView(next.data);
      const ticketId=url.searchParams.get("ticket"),requestId=url.searchParams.get("request"),invoiceId=url.searchParams.get("invoice"),reportId=url.searchParams.get("report"),newsId=url.searchParams.get("news"),orderId=url.searchParams.get("order"),objectId=url.searchParams.get("object");
      if(ticketId)setModal({kind:"ticket",id:ticketId});else if(requestId)setModal({kind:resources.requests.some(request=>request.id===requestId)?"requestDetail":"commercial",id:requestId});else if(invoiceId)setModal({kind:"invoice",id:invoiceId});else if(reportId)setModal({kind:"report",id:reportId});else if(newsId)setModal({kind:"news",id:newsId});else if(orderId)openVisit(orderId);else if(objectId)setModal({kind:"object",id:objectId});else setModal(null);}}})();},
  readAll:()=>{void (async()=>{const result=await saved(readCustomerPortalActivity({accountId,operation:"read_all",commandId:crypto.randomUUID()}));if(!result.ok)unavailable("Meldingen niet bijgewerkt",result.error);})();},
  preferences:()=>setModal({kind:"preferences"}),pay:ids=>{if(ids.length&&ids.every(id=>resources.invoices.some(invoice=>invoice.id===id)))setModal({kind:"payment",ids});},
  chooseAccount:accounts.length>1?()=>{state.revoke();router.push("/klant");}:undefined,
  saveProfile:(profile,versions,commandId)=>saved(saveCustomerPortalProfile({accountId,profile,accountVersion:versions.account,customerVersion:versions.customer,contactVersion:versions.contact,commandId})),
  savePreferences:(preferences,version,commandId)=>saved(saveCustomerPortalPreferences({accountId,preferences,version,commandId})),
 };
 const object=modal&&"id" in modal?workspace.objects.find(item=>item.id===modal.id):undefined;
 const report=modal?.kind==="report"?resources.reports.find(item=>item.id===modal.id):undefined;
 const invoice=modal?.kind==="invoice"?resources.invoices.find(item=>item.id===modal.id):undefined;
 const request=modal?.kind==="requestDetail"?resources.requests.find(item=>item.id===modal.id):undefined;
 const news=modal?.kind==="news"?resources.news.find(item=>item.id===modal.id):undefined;
 const detail=visitState?.id===visitId?visitState.detail:null,visitObject=detail?workspace.objects.find(item=>item.id===detail.visit.objectId):undefined;
 return <CustomerPortal workspace={workspace} tenantId={tenantId} resources={resources} view={view} preferences={snapshot.preferences.groups} preferenceVersion={snapshot.preferences.version} actions={actions} stale={state.stale} availability={customerCoreAvailability}>
  {showPaymentReturn&&<CustomerDialog title="Je betaalstatus wordt gecontroleerd" kicker="Facturen" close={()=>setShowPaymentReturn(false)} footer={<button className="button primary" onClick={()=>{setShowPaymentReturn(false);void refresh();}}>Actuele facturen bekijken</button>}><p>Je bent terug van de betaalprovider. Alleen de bevestiging van de provider bepaalt of je factuur is betaald. De actuele status staat bij je facturen; bij een nog lopende betaling kun je deze hervatten.</p></CustomerDialog>}
  {modal?.kind==="message"&&<CustomerDialog title={modal.title} kicker="Klantportaal" close={close} footer={<button className="button" type="button" onClick={close}>Sluiten</button>}><div className="banner"><Info/><p>{modal.body}</p></div></CustomerDialog>}
  {modal?.kind==="newObject"&&<CustomerObjectForm key="new-object" profile={workspace.profile} accountVersion={workspace.account.version} close={close} save={(value,accountVersion,commandId)=>saved(saveCustomerPortalObject({accountId,accountVersion,object:value,commandId}))}/>}
  {modal?.kind==="editObject"&&object&&<CustomerObjectForm key={`edit:${object.id}`} profile={workspace.profile} object={object} accountVersion={workspace.account.version} close={close} save={(value,accountVersion,commandId)=>saved(saveCustomerPortalObject({accountId,accountVersion,object:value,commandId}))}/>}
  {modal?.kind==="object"&&object&&<CustomerObjectDetail key={`object:${object.id}`} object={object} visits={workspace.visits} timezone={workspace.tenant.timezone} tenant={workspace.tenant.name} editable={workspace.account.canEditObjects&&workspace.tenant.planning} close={close} edit={()=>setModal({kind:"editObject",id:object.id})} request={()=>actions.request(undefined,object.id)} openVisit={openVisit} saveInstruction={(objectId,version,body,commandId)=>saved(addCustomerPortalInstruction({accountId,instruction:{objectId,version,body},commandId}))}/>}
  {modal?.kind==="request"&&<CustomerServiceRequestForm key={`request:${modal.service??""}:${modal.objectId??""}`} workspace={workspace} services={resources.services} service={modal.service} objectId={modal.objectId} close={close} newObject={actions.newObject} save={(request,commandId)=>saved(createCustomerPortalRequest({accountId,request,commandId}))}/>}
  {request&&<CustomerRequestDetail request={request} workspace={workspace} close={close} question={ticket} openPart={id=>setModal({kind:"commercial",id})}/>}
  {modal?.kind==="preferences"&&<CustomerDialog title="Mijn e-mailvoorkeuren" kicker="Mijn gegevens" close={close} footer={<button className="button" type="button" onClick={close}>Sluiten</button>}><CustomerPreferencesForm value={snapshot.preferences.groups} version={snapshot.preferences.version} save={actions.savePreferences}/></CustomerDialog>}
  {modal?.kind==="onboarding"&&<CustomerOnboarding workspace={workspace} draft={snapshot.draft} preferenceVersion={snapshot.preferences.version} close={close} save={(onboarding,commandId)=>saved(saveCustomerPortalOnboarding({accountId,onboarding,commandId}))} refresh={async()=>{const response=await fetch(`/api/customer-portal/snapshot?${new URLSearchParams({account:accountId})}`,{cache:"no-store",credentials:"same-origin",redirect:"error"});if(!response.ok)throw new Error("Actuele toegang niet beschikbaar");const current=customerBaseSnapshotSchema.parse(await response.json());if(current.workspace.account.id!==accountId)throw new Error("Klantaccount gewijzigd");return {workspace:current.workspace,draft:current.draft,preferences:current.preferences.groups,preferenceVersion:current.preferences.version};}} complete={()=>{close();actions.navigate("dashboard");}}/>}
  {modal?.kind==="visit"&&detail&&visitObject&&<CustomerVisitDetailDialog key={`visit:${detail.visit.id}`} detail={detail} object={visitObject} report={resources.reports.find(report=>report.visitId===detail.visit.id&&report.objectId===visitObject.id)} tenant={workspace.tenant.name} timezone={workspace.tenant.timezone} initialNotes={modal.notes} close={close} question={ticket} downloadAllowed={true} accountId={accountId} onSaved={async()=>{await refresh();setVisitRevision(value=>value+1);}}/>}
  {modal?.kind==="visit"&&(!detail||!visitObject)&&<CustomerDialog title="Afspraak controleren" kicker="Mijn afspraken" close={close} footer={<><button className="button" type="button" onClick={close}>Sluiten</button><button className="button primary" type="button" onClick={()=>setVisitRevision(value=>value+1)}>Opnieuw controleren</button></>}><p role={visitState?.error?"alert":"status"}>{visitState?.error||"De actuele klantgebonden afspraak wordt geladen…"}</p></CustomerDialog>}
  {report&&<CustomerDialog title={report.title} kicker="Vrijgegeven rapport" close={close} footer={<><button className="button" type="button" onClick={close}>Sluiten</button><a className="button" href={`/api/customer-portal/files/report/${report.id}?account=${accountId}&preview=1`} target="_blank" rel="noopener noreferrer"><Eye/>PDF bekijken</a><a className="button primary" href={`/api/customer-portal/files/report/${report.id}?account=${accountId}`}><Download/>PDF opslaan</a></>}><CustomerReportBody report={report} object={workspace.objects.find(object=>object.id===report.objectId)?.name??""} tenant={workspace.tenant.name} timezone={workspace.tenant.timezone}/></CustomerDialog>}
  {invoice&&<CustomerDialog title={invoice.number} kicker="Facturen" close={close} footer={<><button className="button" type="button" onClick={close}>Sluiten</button>{invoice.hasPdf&&<><a className="button" href={`/api/customer-portal/files/invoice/${invoice.id}?account=${accountId}&preview=1`} target="_blank" rel="noopener noreferrer"><Eye/>PDF bekijken</a><a className="button" href={`/api/customer-portal/files/invoice/${invoice.id}?account=${accountId}`}><Download/>PDF opslaan</a></>}{invoice.balance>0&&invoice.status!=="credited"&&<button className="button primary" disabled={!resources.paymentEnabled} onClick={()=>actions.pay(invoice.paymentInvoiceIds??[invoice.id])}>{invoice.paymentPending?"Betaling hervatten":"Betalen"}</button>}</>}>{invoice.balance>0&&!resources.paymentEnabled&&<p role="status">Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.</p>}<div className="row"><h3>{invoice.description}</h3><span className="chip gray">{customerInvoiceLabel(invoice)}</span></div><div className="details section-gap"><div><small>Factuurdatum</small><strong>{customerDate(invoice.issuedOn,workspace.tenant.timezone)}</strong></div><div><small>Vervaldatum</small><strong>{customerDate(invoice.dueOn,workspace.tenant.timezone)}</strong></div><div><small>Totaal</small><strong>{money(invoice.total)}</strong></div><div><small>Betaald</small><strong>{money(invoice.paid)}</strong></div><div><small>Gecrediteerd</small><strong>{money(invoice.credited)}</strong></div><div><small>Resterend</small><strong>{money(invoice.balance)}</strong></div></div></CustomerDialog>}
  {modal?.kind==="commercial"&&<CustomerCommercialDetail key={modal.id} accountId={accountId} requestId={modal.id} timezone={workspace.tenant.timezone} customerName={workspace.profile.fullName} close={close} save={(action,commandId)=>saved(saveCustomerCommercial({accountId,action,commandId}))}/>}
  {modal?.kind==="ticket"&&<CustomerTicketDialog key={modal.id??`new:${modal.route}`} accountId={accountId} tenantId={tenantId} workspace={workspace} ticketId={modal.id} route={modal.route} close={close} save={(action,commandId)=>saved(saveCustomerTicket({accountId,action,commandId}))}/>}
  {modal?.kind==="payment"&&<CustomerPaymentDialog accountId={accountId} paymentEnabled={resources.paymentEnabled} invoices={resources.invoices.filter(invoice=>modal.ids.includes(invoice.id))} close={close} refresh={refresh}/>}
  {news&&<CustomerNewsDetailDialog key={`news:${news.id}`} news={news} tenant={workspace.tenant.name} timezone={workspace.tenant.timezone} close={close} mark={(notificationId,version,operation,commandId)=>saved(markCustomerPortalNews({accountId,notificationId,version,operation,commandId}))}/>}
 </CustomerPortal>;
}
