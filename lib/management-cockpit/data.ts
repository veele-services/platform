import 'server-only';
import {z} from 'zod';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {ticketRpc} from '@/lib/tickets/rpc';
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
 const{context,db}=await cockpitActor(focus.sourceKind==='invoice'?'backoffice.finance.read':focus.sourceKind==='work_order'?'backoffice.work_orders.read':'backoffice.followup.read');
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
  const{data:invoice,error}=await db.from('invoices').select('id,invoice_number').eq('tenant_id',context.tenant.id).eq('id',focus.sourceId).maybeSingle();
  if(error)throw error;if(!invoice)throw Object.assign(new Error('Geen toegankelijke factuur.'),{code:'42501'});
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:context.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return{source:{id:invoice.id,kind:'invoice',label:invoice.invoice_number||'Conceptfactuur',href:'/app/facturen?'+new URLSearchParams({record:invoice.id})},tenantName:context.tenant.name,today:[part('year'),part('month'),part('day')].join('-'),actions:[],total:0,page:1};
 }
 if(focus.sourceKind==='ticket'){
  const ticket=await ticketRpc(db,'ticket_query',{target_tenant:context.tenant.id,actor_context:'tenant',operation:'detail',payload:{ticket_id:focus.sourceId}});
  return projectTicketFollowupSource(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),ticket,focus,context.tenant.name);
 }
 return projectFollowupSource(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),focus,context.tenant.name);
}
