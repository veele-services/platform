import {z} from 'zod';
import {isClosedAction} from '@/lib/dossiers/status';

export const followupFilters=['today','week','overdue','mine','unassigned','all','done','snoozed'] as const;
export const followupQuerySchema=z.object({filter:z.enum(followupFilters).default('today'),search:z.string().trim().max(160).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(100).default(8)}).strict();
export type FollowupQuery=z.infer<typeof followupQuerySchema>;
const id=z.uuid(),date=z.iso.date();
const sourceSchema=z.object({id,kind:z.enum(['request','execution','object','personnel']),title:z.string(),status:z.string(),priority:z.string(),due_on:date.nullable(),owner_id:id.nullable(),version:z.number().int(),customer_id:id.nullable(),object_id:id.nullable(),personnel_id:id.nullable(),work_order_id:id.nullable(),href:z.string().regex(/^\/app\//),canModify:z.boolean().default(false)});
const manualSchema=z.object({id,source_kind:z.string(),source_id:id,title:z.string(),scope:z.enum(['general','finance','personnel','quality']),due_on:date,original_due_on:date,owner_id:id.nullable(),state:z.enum(['open','done']),snoozed_until:date.nullable(),note:z.string(),automatic:z.boolean(),source_paused:z.boolean().default(false),trigger_key:z.string().nullable().optional(),canModify:z.boolean().default(true),revision:z.number().int()});
const overlaySchema=z.object({source_kind:sourceSchema.shape.kind,source_id:id,owner_id:id.nullable(),snoozed_until:date.nullable(),note:z.string(),revision:z.number().int()});
export const followupRawSchema=z.object({sources:z.array(sourceSchema),actions:z.array(manualSchema),overlays:z.array(overlaySchema),owners:z.array(z.object({id,name:z.string()})),customers:z.array(z.object({id,name:z.string()})),sourceOptions:z.array(z.object({id,kind:z.string(),label:z.string(),href:z.string().regex(/^\/app(?:\/|$)/)})),actorId:id,today:date,canWrite:z.boolean()});
export type FollowupAction={id:string;kind:'manual'|'request'|'execution'|'object'|'personnel';title:string;type:string;due:string|null;originalDue:string|null;ownerId:string|null;owner:string;status:'open'|'done'|'snoozed';priority:string;sourceId:string;sourceKind:string;sourceType:string;customer:string;note:string;snoozedUntil:string|null;automatic:boolean;revision:number;sourceVersion:number|null;href:string;canComplete:boolean;canModify:boolean;contextSourceId:string;contextSourceKind:string};
export type FollowupState={today:string;actorId:string;actions:FollowupAction[];owners:Array<{id:string;name:string}>;sourceOptions:z.infer<typeof followupRawSchema>['sourceOptions'];counts:Record<typeof followupFilters[number],number>;total:number;page:number;pageSize:number;canWrite:boolean};
const types={request:'Klantverzoek',execution:'Uitvoering',object:'Objectactie',personnel:'Personeel'};
function week(today:string){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return[from,d.toISOString().slice(0,10)]}
function followupActions(value:unknown,tenantName:string){
 const raw=followupRawSchema.parse(value),owner=(id:string|null)=>raw.owners.find(o=>o.id===id)?.name||(id?'Niet meer actief':'');
 const actions:FollowupAction[]=raw.sources.map(s=>{
  const o=raw.overlays.find(o=>o.source_kind===s.kind&&o.source_id===s.id),ownerId=['object','personnel'].includes(s.kind)?s.owner_id:o?.owner_id||s.owner_id;
  const done=isClosedAction(s.status),snoozedUntil=o?.snoozed_until||null;
  return{id:s.id,kind:s.kind,title:s.title,type:types[s.kind],due:s.due_on,originalDue:s.due_on,ownerId,owner:owner(ownerId),status:done?'done':snoozedUntil&&snoozedUntil>raw.today?'snoozed':'open',priority:s.priority,sourceId:s.kind==='execution'?s.work_order_id||s.id:s.id,sourceKind:s.kind,sourceType:types[s.kind],customer:raw.customers.find(c=>c.id===s.customer_id)?.name||tenantName,note:o?.note||'',snoozedUntil,automatic:true,revision:o?.revision||0,sourceVersion:s.version,contextSourceId:s.kind==='personnel'?s.personnel_id||s.id:s.kind==='execution'?s.work_order_id||s.id:s.object_id||s.id,contextSourceKind:s.kind==='personnel'?'personnel':s.kind==='execution'?'work_order':'object',href:s.href,canComplete:false,canModify:s.canModify&&raw.canWrite};
 });
 for(const a of raw.actions){const source=raw.sourceOptions.find(o=>o.id===a.source_id&&o.kind===a.source_kind);actions.push({id:a.id,kind:'manual',title:a.title,type:a.trigger_key?.startsWith('sla-ticket:')?'SLA':a.trigger_key?.startsWith('requirement:')?'Document':a.trigger_key?.startsWith('decision:')?'Besluit':({finance:'Financieel',personnel:'Personeel',quality:'Document',general:'Opvolging'})[a.scope],due:a.due_on,originalDue:a.original_due_on,ownerId:a.owner_id,owner:owner(a.owner_id),status:a.state==='done'?'done':a.source_paused||a.snoozed_until&&a.snoozed_until>raw.today?'snoozed':'open',priority:'normal',sourceId:a.trigger_key?.startsWith('sla-ticket:')||a.trigger_key?.startsWith('requirement:')||a.trigger_key?.startsWith('decision:')?a.trigger_key.split(':')[1]:a.source_id,sourceKind:a.source_kind,sourceType:a.trigger_key?.startsWith('sla-ticket:')?'Ticketklok':a.trigger_key?.startsWith('requirement:')?'Compliance-dossier':a.trigger_key?.startsWith('decision:')?'Beslisnotitie':source?.kind||'Dossier',customer:source?.label||tenantName,note:a.note,snoozedUntil:a.snoozed_until,automatic:a.automatic,revision:a.revision,sourceVersion:null,contextSourceId:a.trigger_key?.startsWith('sla-ticket:')?a.trigger_key.split(':')[1]:a.source_id,contextSourceKind:a.trigger_key?.startsWith('sla-ticket:')?'ticket':a.source_kind,href:a.trigger_key?.startsWith('sla-ticket:')?'/app/sla?record='+encodeURIComponent('ticket:'+a.trigger_key.split(':').slice(1).join(':')):a.trigger_key?.startsWith('requirement:')?'/app/compliance?record='+a.trigger_key.split(':')[1]:a.trigger_key?.startsWith('decision:')?'/app/besluiten?record='+a.trigger_key.split(':')[1]:source?.href||'/app/opvolging',canComplete:!a.automatic,canModify:raw.canWrite&&a.canModify})}
 return{raw,actions};
}
export function projectFollowup(value:unknown,query:FollowupQuery,tenantName:string,focus?:{id:string;kind:string}):FollowupState{
 const{raw,actions}=followupActions(value,tenantName),[from,until]=week(raw.today);
 const matches=(a:FollowupAction,f:string)=>f==='done'?a.status==='done':f==='snoozed'?a.status==='snoozed':a.status==='open'&&(f==='today'?a.due===raw.today:f==='week'?!!a.due&&a.due>=from&&a.due<=until:f==='overdue'?!!a.due&&a.due<raw.today:f==='mine'?a.ownerId===raw.actorId:f==='unassigned'?!a.ownerId:true);
 const counts=Object.fromEntries(followupFilters.map(f=>[f,actions.filter(a=>matches(a,f)).length])) as FollowupState['counts'];
 const rows=actions.filter(a=>focus?a.id===focus.id&&a.kind===focus.kind:matches(a,query.filter)&&`${a.title} ${a.customer} ${a.owner} ${a.sourceId}`.toLocaleLowerCase('nl-NL').includes(query.search.toLocaleLowerCase('nl-NL'))).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.id.localeCompare(b.id));
 const page=Math.min(query.page,Math.max(1,Math.ceil(rows.length/query.pageSize)));
 return{today:raw.today,actorId:raw.actorId,actions:rows.slice((page-1)*query.pageSize,page*query.pageSize),owners:raw.owners,sourceOptions:raw.sourceOptions,counts,total:rows.length,page,pageSize:query.pageSize,canWrite:raw.canWrite};
}

export const followupCommandSchema=z.object({requestId:id,command:z.enum(['create','assign','snooze','complete','reopen']),input:z.object({id:id.optional(),kind:z.enum(['manual','request','execution','object','personnel']).optional(),sourceKind:z.enum(['customer','object','personnel','work_order','commercial_request','quote','agreement','tenant']).optional(),sourceId:id.optional(),title:z.string().trim().min(2).max(180).optional(),scope:z.enum(['general','finance','personnel','quality']).optional(),due:date.optional(),owner:id.nullable().optional(),note:z.string().trim().max(10000).optional(),revision:z.number().int().nonnegative().optional(),sourceVersion:z.number().int().positive().nullable().optional()}).strict()}).strict().superRefine(({command,input},ctx)=>{
 const required=command==='create'?['sourceKind','sourceId','title','due']:['id','kind','revision'];
 if(command!=='create'&&input.kind!=='manual')required.push('sourceVersion');
 if(command==='snooze')required.push('due');
 if(command==='assign'&&!Object.hasOwn(input,'owner'))required.push('owner');
 for(const key of required)if(!Object.hasOwn(input,key)||input[key as keyof typeof input]===undefined||key==='sourceVersion'&&input.sourceVersion===null)ctx.addIssue({code:'custom',path:['input',key],message:'Dit veld is verplicht voor deze opdracht.'});
 if((command==='snooze'||command==='complete')&&(input.note?.trim().length||0)<3)ctx.addIssue({code:'custom',path:['input','note'],message:'Geef een onderbouwde terugkoppeling.'});
});
export const followupDetailSchema=z.object({kind:z.enum(['manual','request','execution','object','personnel']),id}).strict();
export const followupHistorySchema=z.array(z.object({id,event:z.string(),revision:z.number().int(),actor:z.string(),createdAt:z.iso.datetime({offset:true}),details:z.object({note:z.string().optional(),owner:id.nullable().optional(),until:date.nullable().optional(),originalDue:date.nullable().optional()})}));
export type FollowupHistory=z.infer<typeof followupHistorySchema>;
export type FollowupDetail={action:FollowupAction;history:FollowupHistory};

export const followupSourceQuerySchema=z.object({sourceKind:z.enum(['tenant','customer','object','personnel','work_order','commercial_request','quote','agreement','ticket']),sourceId:id,page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export type FollowupSource={source:{id:string;kind:string;label:string;href:string};tenantName:string;today:string;actions:FollowupAction[];total:number;page:number};
export function projectFollowupSource(value:unknown,focus:z.infer<typeof followupSourceQuerySchema>,tenantName:string):FollowupSource{
 const{raw,actions}=followupActions(value,tenantName),source=raw.sourceOptions.find(s=>s.id===focus.sourceId&&s.kind===focus.sourceKind);
 if(!source)throw Object.assign(new Error('Geen toegang tot dit brondossier.'),{code:'42501'});
 const rows=actions.filter(a=>a.contextSourceKind===source.kind&&a.contextSourceId===source.id).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.id.localeCompare(b.id));
 const page=Math.min(focus.page,Math.max(1,Math.ceil(rows.length/20)));
 return{source,tenantName,today:raw.today,actions:rows.slice((page-1)*20,page*20),total:rows.length,page};
}

/** A native ticket DTO is authorized before reaching this adapter. Never look
 * up its title or audience in a broad backoffice join. */
export function projectTicketFollowupSource(value:unknown,authorizedTicket:unknown,focus:{sourceId:string;page:number},tenantName:string):FollowupSource{
 const ticket=z.object({id:z.uuid(),number:z.string(),title:z.string()}).parse(authorizedTicket);if(ticket.id!==focus.sourceId)throw Object.assign(new Error('Geen toegankelijk bronticket.'),{code:'42501'});
 const{raw,actions}=followupActions(value,tenantName),rows=actions.filter(a=>a.contextSourceKind==='ticket'&&a.contextSourceId===ticket.id),page=Math.min(focus.page,Math.max(1,Math.ceil(rows.length/20)));
 return{source:{id:ticket.id,kind:'ticket',label:ticket.number+' · '+ticket.title,href:'/app/meldingen/'+ticket.id},tenantName,today:raw.today,actions:rows.slice((page-1)*20,page*20),total:rows.length,page};
}
