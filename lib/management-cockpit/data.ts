import 'server-only';
import {z} from 'zod';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {ticketRpc} from '@/lib/tickets/rpc';
import {projectDetail} from '@/lib/tickets/projection';
import {ticketStatusLabels} from '@/lib/tickets/model';
import {invoiceLabels} from '@/lib/finance/source-invoices';
import {entityWireSchema} from './entities';
import {requestLabels,quoteLabels} from '@/lib/commercial/model';
import {projectFollowup,followupQuerySchema,followupHistorySchema,followupRawSchema,projectFollowupSource,projectTicketFollowupSource,followupSourceQuerySchema,type FollowupQuery,type FollowupDetail} from './followup';

export async function cockpitActor(capability='backoffice.followup.read'){
 const h=await headers();if(h.get(HOST_KIND_HEADER)!=='tenant'||!h.get(TENANT_SLUG_HEADER))throw Object.assign(new Error('Open je eigen organisatie.'),{code:'42501'});
 const db=await createClient(),{data,error}=await db.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Log opnieuw in.'),{code:'42501'});
 const context=await getAuthContext();if(!context.tenant||context.tenant.slug!==h.get(TENANT_SLUG_HEADER)||!hasManagementPermission(context.tenant,capability))throw Object.assign(new Error('Geen managementtoegang.'),{code:'42501'});
 return{context:{...context,tenant:context.tenant},db};
}
export async function loadFollowup({context,db}:Awaited<ReturnType<typeof cockpitActor>>,query:FollowupQuery){
 const h=await headers();if(h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug)throw Object.assign(new Error('Open je eigen organisatie.'),{code:'42501'});
 return projectFollowup(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),query,context.tenant.name);
}
export async function getFollowup(query:FollowupQuery){return loadFollowup(await cockpitActor(),query)}
export async function getFollowupDetail(focus:{id:string;kind:string}):Promise<FollowupDetail>{
 const{context,db}=await cockpitActor();
 const raw=await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id});
 const action=projectFollowup(raw,followupQuerySchema.parse({}),context.tenant.name,focus).actions[0];
 if(!action)throw Object.assign(new Error('Deze bron is niet beschikbaar binnen je actuele rechten.'),{code:'42501'});
 const history=followupHistorySchema.parse(await ticketRpc(db,'cockpit_action_history',{target_tenant:context.tenant.id,kind:focus.kind,record_id:focus.id}));
 return{action,history};
}

export async function getFollowupSource(focus:import('zod').z.infer<typeof followupSourceQuerySchema>){
 const modules:Record<string,string>={customer:'customers',object:'objects',personnel:'personnel',commercial_request:'commercial',quote:'commercial',invoice:'finance',work_order:'work_orders'};
 const{context,db}=await cockpitActor(focus.sourceKind==='ticket'?'tickets.internal.read':modules[focus.sourceKind]?'backoffice.'+modules[focus.sourceKind]+'.read':'backoffice.followup.read');
 const canFollowup=hasManagementPermission(context.tenant,'backoffice.followup.read')&&hasManagementPermission(context.tenant,'backoffice.functions.cockpit_followup');
 const attach=async(source:import('./followup').FollowupSource['source'])=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:context.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const unavailable={source,tenantName:context.tenant.name,today:['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-'),actions:[],total:0,page:1,canFollowup:false};
  if(!canFollowup)return unavailable;
  const raw=followupRawSchema.parse(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}));
  if(!raw.sourceOptions.some(s=>s.kind===source.kind&&s.id===source.id))return unavailable;
  return{...projectFollowupSource(raw,focus,context.tenant.name),source,canFollowup:true};
 };
 if(focus.sourceKind==='customer'||focus.sourceKind==='object'||focus.sourceKind==='personnel'){
  // The native invoker projection checks the page, function and exact record.
  // A source preview exposes none of its HR, document or editing collections.
  const wire=entityWireSchema.parse(await ticketRpc(db,'cockpit_entity_query',{target_tenant:context.tenant.id,source_kind:focus.sourceKind,source_id:focus.sourceId}));
  if(wire.profile.id!==focus.sourceId||wire.profile.kind!==focus.sourceKind)throw Object.assign(new Error('Geen toegankelijke bron.'),{code:'42501'});
  const paths={customer:'klanten',object:'objecten',personnel:'personeel'},source={id:wire.profile.id,kind:focus.sourceKind,label:wire.profile.name,href:'/app/'+paths[focus.sourceKind]+'/'+wire.profile.id};
  return{...await attach(source),reference:wire.profile.number,status:({active:'Actief',lead:'Prospect',paused:'Gepauzeerd',inactive:'Inactief',archived:'Gearchiveerd',invited:'Uitgenodigd',former:'Uit dienst'} as Record<string,string>)[wire.profile.status]||wire.profile.status};
 }
 if(focus.sourceKind==='commercial_request'||focus.sourceKind==='quote'){
  const quote=focus.sourceKind==='quote',table=quote?'quotes':'requests';
  // Same current-session RLS as the existing global search; no service client.
  const{data:row,error}=await db.from(table).select(quote?'id,subject,status,quote_number,published_at,expires_at,followup_on,next_action':'id,subject,status,request_number,followup_on,next_action').eq('tenant_id',context.tenant.id).eq('id',focus.sourceId).maybeSingle();
  if(error)throw error;if(!row)throw Object.assign(new Error('Geen toegankelijke commerciële bron.'),{code:'42501'});
  const record=z.object({id:z.uuid(),subject:z.string(),status:z.string(),request_number:z.string().nullish(),quote_number:z.string().nullish(),published_at:z.string().nullish(),expires_at:z.string().nullish(),followup_on:z.string().nullish(),next_action:z.string()}).parse(row),reference=(quote?record.quote_number:record.request_number)||record.subject;
  return{...await attach({id:record.id,kind:focus.sourceKind,label:record.subject,href:'/app/aanvragen?'+new URLSearchParams({...(quote?{tab:'quotes'}:{}),recordKind:quote?'quote':'request',record:record.id})}),reference,status:((quote?quoteLabels:requestLabels) as Record<string,string>)[record.status]||record.status,commercial:{kind:quote?'quote' as const:'request' as const,publishedAt:record.published_at||null,expiresAt:record.expires_at||null,followupOn:record.followup_on||null,nextAction:record.next_action,timezone:context.tenant.timezone}};
 }
 if(focus.sourceKind==='work_order'){
  const wire=z.object({dossier:z.object({order:z.object({id:z.uuid(),number:z.string(),title:z.string(),customer:z.string(),object:z.string(),status:z.string(),start:z.string().nullable(),plannerId:z.uuid().nullable().default(null),description:z.string()}),finance:z.boolean(),financial:z.object({invoices:z.array(z.object({id:z.uuid(),number:z.string().nullable(),totalCents:z.number().int(),paidCents:z.number().int()})).default([])}).nullish()}),followup:followupRawSchema.nullable(),financial:z.object({rows:z.array(z.object({id:z.string(),description:z.string(),amountCents:z.number().int().nonnegative(),category:z.enum(['confirmed','review','unpaid'])})).max(50),total:z.number().int().nonnegative()})}).parse(await ticketRpc(db,'cockpit_work_order_source',{target_tenant:context.tenant.id,target_order:focus.sourceId}));
  const dossier=wire.dossier,raw=wire.followup;let financial=wire.financial;
  const source={id:dossier.order.id,kind:'work_order',label:dossier.order.number+' · '+dossier.order.title,href:'/app/werkbonnen/'+dossier.order.id},parts=new Intl.DateTimeFormat('en-CA',{timeZone:context.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),today=['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');
  let result:import('./followup').FollowupSource={source,tenantName:context.tenant.name,today,actions:[],total:0,page:1,canFollowup:!!raw};if(raw){raw.sourceOptions.push(source);result={...projectFollowupSource(raw,focus,context.tenant.name),canFollowup:true}}
  if(!dossier.finance)financial={rows:[],total:0};
  const day=dossier.order.start?new Intl.DateTimeFormat('en-CA',{timeZone:context.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(dossier.order.start)):null;
  return{...result,workOrder:{number:dossier.order.number,title:dossier.order.title,customerObject:[dossier.order.customer,dossier.order.object].filter(Boolean).join(' · '),status:dossier.order.status,owner:(dossier.order.plannerId?raw?.owners.find(o=>o.id===dossier.order.plannerId)?.name||'Toegewezen planner':result.actions.find(a=>a.owner)?.owner)||'Niet toegewezen',date:day?['year','month','day'].map(k=>day.find(p=>p.type===k)!.value).join('-'):null,description:dossier.order.description,finance:dossier.finance,financialRows:financial.rows,financialTotal:financial.total}};
 }
 if(focus.sourceKind==='invoice'){
  if(!context.tenant.enabledServices.includes('finance'))throw Object.assign(new Error('Geen financiële toegang.'),{code:'42501'});
  const{data:invoice,error}=await db.from('invoices').select('id,invoice_number,status').eq('tenant_id',context.tenant.id).eq('id',focus.sourceId).maybeSingle();
  if(error)throw error;if(!invoice)throw Object.assign(new Error('Geen toegankelijke factuur.'),{code:'42501'});
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:context.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return{source:{id:invoice.id,kind:'invoice',label:invoice.invoice_number||'Conceptfactuur',href:'/app/facturen?'+new URLSearchParams({record:invoice.id})},reference:invoice.invoice_number||'Conceptfactuur',status:(invoiceLabels as Record<string,string>)[invoice.status]||invoice.status,tenantName:context.tenant.name,today:[part('year'),part('month'),part('day')].join('-'),actions:[],total:0,page:1};
 }
 if(focus.sourceKind==='ticket'){
  const ticket=await ticketRpc(db,'ticket_query',{target_tenant:context.tenant.id,actor_context:'tenant',operation:'detail',payload:{ticket_id:focus.sourceId}});
  const detail=projectDetail(ticket,'tenant');
  if(!detail||detail.id!==focus.sourceId)throw Object.assign(new Error('Geen toegankelijk bronticket.'),{code:'42501'});
  const result=canFollowup?projectTicketFollowupSource(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),ticket,focus,context.tenant.name):await attach({id:detail.id,kind:'ticket',label:detail.number+' · '+detail.subject,href:'/app/meldingen/'+detail.id});
  return{...result,source:{...result.source,label:detail.subject},reference:detail.number,status:ticketStatusLabels[detail.status],owner:detail.assignee?.label||detail.assignedGroupName||'Niet toegewezen',ticket:{timezone:detail.timezone,responseDueAt:detail.responseDueAt,followupDueAt:detail.followupDueAt,history:detail.history.slice(-30).map(e=>({label:e.label,actor:e.actorLabel,at:e.createdAt})),historyTotal:detail.history.length}};
 }
 const result=projectFollowupSource(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),focus,context.tenant.name);
 if(focus.sourceKind==='agreement'){
  // The native source register already required commercial/customer scope and
  // financial OR commercial read access. RLS remains active for this read.
  const{data:agreement,error}=await db.from('customer_agreements').select('id,title,version,state,starts_on,ends_on').eq('tenant_id',context.tenant.id).eq('id',focus.sourceId).maybeSingle();
  if(error)throw error;if(!agreement)throw Object.assign(new Error('Geen toegankelijke overeenkomst.'),{code:'42501'});
  return{...result,reference:agreement.title+' · v'+agreement.version,agreement:{title:agreement.title,version:agreement.version,state:agreement.state,from:agreement.starts_on,until:agreement.ends_on,canSla:context.tenant.enabledServices.includes('planning')&&hasManagementPermission(context.tenant,'backoffice.sla.read')&&hasManagementPermission(context.tenant,'backoffice.functions.cockpit_sla_query')}};
 }
 return result;
}
