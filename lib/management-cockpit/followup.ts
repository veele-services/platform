import {z} from 'zod';
import {isClosedAction} from '@/lib/dossiers/status';

export const followupFilters=['today','week','overdue','mine','unassigned','all','done','snoozed'] as const;
export const followupQuerySchema=z.object({filter:z.enum(followupFilters).default('today'),search:z.string().trim().max(160).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(100).default(8)}).strict();
export type FollowupQuery=z.infer<typeof followupQuerySchema>;
const id=z.uuid(),date=z.iso.date();
const sourceSchema=z.object({id,kind:z.enum(['request','execution','object','personnel']),title:z.string(),status:z.string(),priority:z.string(),due_on:date.nullable(),owner_id:id.nullable(),version:z.number().int(),customer_id:id.nullable(),object_id:id.nullable(),personnel_id:id.nullable(),work_order_id:id.nullable(),href:z.string().regex(/^\/app\//),canModify:z.boolean().default(false)});
const manualSchema=z.object({id,source_kind:z.string(),source_id:id,title:z.string(),scope:z.enum(['general','finance','personnel','quality']),due_on:date,original_due_on:date,owner_id:id.nullable(),state:z.enum(['open','done']),snoozed_until:date.nullable(),note:z.string(),automatic:z.boolean(),revision:z.number().int()});
const overlaySchema=z.object({source_kind:sourceSchema.shape.kind,source_id:id,owner_id:id.nullable(),snoozed_until:date.nullable(),note:z.string(),revision:z.number().int()});
export const followupRawSchema=z.object({sources:z.array(sourceSchema),actions:z.array(manualSchema),overlays:z.array(overlaySchema),owners:z.array(z.object({id,name:z.string()})),customers:z.array(z.object({id,name:z.string()})),sourceOptions:z.array(z.object({id,kind:z.string(),label:z.string(),href:z.string().regex(/^\/app(?:\/|$)/)})),actorId:id,today:date,canWrite:z.boolean()});
export type FollowupAction={id:string;kind:'manual'|'request'|'execution'|'object'|'personnel';title:string;type:string;due:string|null;originalDue:string|null;ownerId:string|null;owner:string;status:'open'|'done'|'snoozed';priority:string;sourceId:string;sourceKind:string;sourceType:string;customer:string;note:string;snoozedUntil:string|null;automatic:boolean;revision:number;sourceVersion:number|null;href:string;canComplete:boolean;canModify:boolean};
export type FollowupState={today:string;actorId:string;actions:FollowupAction[];owners:Array<{id:string;name:string}>;sourceOptions:z.infer<typeof followupRawSchema>['sourceOptions'];counts:Record<typeof followupFilters[number],number>;total:number;page:number;pageSize:number;canWrite:boolean};
const types={request:'Klantverzoek',execution:'Uitvoering',object:'Objectactie',personnel:'Personeel'};
function week(today:string){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return[from,d.toISOString().slice(0,10)]}
export function projectFollowup(value:unknown,query:FollowupQuery,tenantName:string,focus?:{id:string;kind:string}):FollowupState{
 const raw=followupRawSchema.parse(value),[from,until]=week(raw.today),owner=(id:string|null)=>raw.owners.find(o=>o.id===id)?.name||'';
 const actions:FollowupAction[]=raw.sources.map(s=>{
  const o=raw.overlays.find(o=>o.source_kind===s.kind&&o.source_id===s.id),ownerId=['object','personnel'].includes(s.kind)?s.owner_id:o?.owner_id||s.owner_id;
  const done=isClosedAction(s.status),snoozedUntil=o?.snoozed_until||null;
  return{id:s.id,kind:s.kind,title:s.title,type:types[s.kind],due:s.due_on,originalDue:s.due_on,ownerId,owner:owner(ownerId),status:done?'done':snoozedUntil&&snoozedUntil>raw.today?'snoozed':'open',priority:s.priority,sourceId:s.kind==='execution'?s.work_order_id||s.id:s.id,sourceKind:s.kind,sourceType:types[s.kind],customer:raw.customers.find(c=>c.id===s.customer_id)?.name||tenantName,note:o?.note||'',snoozedUntil,automatic:true,revision:o?.revision||0,sourceVersion:s.version,href:s.href,canComplete:false,canModify:s.canModify&&raw.canWrite};
 });
 for(const a of raw.actions){const source=raw.sourceOptions.find(o=>o.id===a.source_id&&o.kind===a.source_kind);actions.push({id:a.id,kind:'manual',title:a.title,type:({finance:'Financieel',personnel:'Personeel',quality:'Document',general:'Opvolging'})[a.scope],due:a.due_on,originalDue:a.original_due_on,ownerId:a.owner_id,owner:owner(a.owner_id),status:a.state==='done'?'done':a.snoozed_until&&a.snoozed_until>raw.today?'snoozed':'open',priority:'normal',sourceId:a.source_id,sourceKind:a.source_kind,sourceType:source?.kind||'Dossier',customer:source?.label||tenantName,note:a.note,snoozedUntil:a.snoozed_until,automatic:a.automatic,revision:a.revision,sourceVersion:null,href:source?.href||'/app/opvolging',canComplete:true,canModify:raw.canWrite})}
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
