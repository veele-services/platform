import { TravelOrderPanel } from "@/components/fieldgrid/travel";
import { businessToday } from "@/lib/personnel/dossier";
import { TaskExecution } from "@/components/fieldgrid/task-execution";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
import Link from "next/link";
import { executionLabels } from "@/lib/dossiers/status";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";

import {ObjectVisitSignals} from "@/components/fieldgrid/objects/visit-signals";
export default async function WorkOrderDetail({params}:{params:Promise<{workOrderId:string}>}){
 const context=await getAuthContext();const {workOrderId}=await params;
 if(!context.tenant||!context.tenant.enabledServices.includes("planning")||!context.tenant.roles.some(r=>["tenant_admin","management","planner","hr","finance"].includes(r))||!/^[a-f0-9-]{36}$/i.test(workOrderId))notFound();
 const db=await createClient();const {data:order}=await db.from("work_orders").select("*").eq("tenant_id",context.tenant.id).eq("id",workOrderId).maybeSingle();if(!order)notFound();
 const workspace=await getWorkspaceData(context.tenant.id);
 const assignmentIds=workspace.assignments.filter(a=>a.work_order_id===order.id).map(a=>a.id);
 const {data:times,error}=await db.from("time_entries").select("*").eq("tenant_id",context.tenant.id).in("assignment_id",assignmentIds).order("starts_at");if(error)throw new Error("Uren tijdelijk niet beschikbaar.");
 const date=(value:string|null)=>value?new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Amsterdam"}).format(new Date(value)):"—";
 const status=executionLabels;
 const snapshot=order.object_snapshot as Record<string,unknown>;
 return <BackofficeShell context={{...context,tenant:context.tenant}} data={workspace} initialView="werkbonnen"><div className="personnel-dossier"><Link className="dossier-back" href="/app/werkbonnen"><ArrowLeft size={16}/>Terug naar werkbonnen</Link><header className="page-intro"><span className="eyebrow">UITVOERING</span><h1>{order.work_order_number}</h1><p>{order.discipline} · {status[order.status]||"In behandeling"}</p></header><section className="dossier-card"><dl className="dossier-facts"><div><dt>Klant</dt><dd><Link href={`/app/klanten?record=${order.customer_id}`}>{workspace.customers.find(c=>c.id===order.customer_id)?.name||"Klant"}</Link></dd></div><div><dt>Object</dt><dd><Link href={`/app/objecten/${order.object_id}`}>{typeof snapshot.name==="string"?snapshot.name:workspace.objects.find(o=>o.id===order.object_id)?.name||"Object"}</Link></dd></div><div><dt>Start</dt><dd>{date(order.projected_start_at)}</dd></div><div><dt>Einde</dt><dd>{date(order.projected_end_at)}</dd></div></dl></section>{order.projected_start_at&&<section className="dossier-card"><TravelOrderPanel day={businessToday(new Date(order.projected_start_at),context.tenant.timezone)} orderId={order.id}/></section>}<section className="dossier-card"><h2>Werkrapport</h2><ObjectVisitSignals orderId={order.id}/>{workspace.reports.filter(r=>r.work_order_id===order.id).map(r=><article key={r.id}><small>{date(r.created_at)}</small><p>{r.body}</p></article>)}{!workspace.reports.some(r=>r.work_order_id===order.id)&&<p>Nog geen rapportregels.</p>}<Link href="/app/rapporten" className="text-link">Naar de bestaande rapportcontrole</Link></section><section className="dossier-card" id="uitvoering"><h2>Uitvoering & factureerbare bronnen</h2>{workspace.workOrderTasks.filter(t=>t.work_order_id===order.id).map(t=><TaskExecution key={t.id} task={t} editable={["in_progress","correction_required"].includes(order.status)&&context.tenant!.roles.some(r=>["tenant_admin","management","planner"].includes(r))} reviewed={["invoice_ready","invoiced"].includes(order.status)} allocated={workspace.invoiceLines.filter(l=>l.work_order_task_id===t.id).reduce((sum,l)=>sum+l.quantity,0)}/>)}</section><DossierChainPanel scope={{orderId:order.id}} view="requests" timezone={context.tenant.timezone}/><section className="dossier-card" id="uren"><h2>Urenregistratie</h2><div className="table-scroll"><table className="resource-table"><thead><tr><th>Medewerker</th><th>Start</th><th>Einde</th><th>Soort</th><th>Status</th></tr></thead><tbody>{times.map(t=><tr key={t.id}><td>{workspace.personnel.find(p=>p.id===t.personnel_id)?.full_name||"Medewerker"}</td><td>{date(t.starts_at)}</td><td>{date(t.ends_at)}</td><td>{({work:"Werk",travel:"Reis",break:"Pauze",correction:"Correctie"})[t.kind]}</td><td>{({draft:"Concept",submitted:"Ingediend",approved:"Goedgekeurd",rejected:"Afgekeurd"} as Record<string,string>)[t.status]||"In behandeling"}</td></tr>)}</tbody></table></div>{!times.length&&<p>Geen uren geregistreerd.</p>}</section></div></BackofficeShell>;
}
