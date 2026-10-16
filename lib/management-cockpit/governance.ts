import {z} from 'zod';
const id=z.uuid(),date=z.iso.date(),stamp=z.string();
export const governanceModules=['decisions','compliance'] as const;
export const sourceKindSchema=z.enum(['tenant','customer','object','personnel','work_order','commercial_request','quote','agreement']);
export const governanceQuerySchema=z.object({module:z.enum(governanceModules),search:z.string().trim().max(160).default(''),filter:z.enum(['all','drafts','final','attention','valid']).default('all'),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(100).default(20),historyPage:z.coerce.number().int().min(1).max(100000).default(1),record:id.optional()}).strict().superRefine((q,c)=>{if(q.module==='decisions'&&['attention','valid'].includes(q.filter)||q.module==='compliance'&&['drafts','final'].includes(q.filter))c.addIssue({code:'custom',path:['filter'],message:'Kies een filter van dit register.'})});
export type GovernanceQuery=z.infer<typeof governanceQuerySchema>;
export const governanceEvidenceQuerySchema=z.object({sourceKind:sourceKindSchema,sourceId:id,search:z.string().trim().max(160).default(''),selected:id.optional()}).strict();
const revision=z.number().int().positive();
const decisionInput=z.object({id,revision:revision.optional(),title:z.string().trim().min(2).max(180).optional(),reason:z.string().trim().min(3).max(10000).optional(),motivation:z.string().trim().min(3).max(15000).optional(),scope:z.enum(['general','finance','personnel']).optional(),owner:id.optional(),sourceKind:sourceKindSchema.optional(),sourceId:id.optional(),followup:z.boolean().optional(),due:date.optional()}).strict();
const requirementInput=z.object({id,revision:revision.optional(),title:z.string().trim().min(2).max(180).optional(),subject:z.string().trim().min(2).max(300).optional(),owner:id.nullable().optional(),sourceKind:sourceKindSchema.optional(),sourceId:id.optional(),expiresOn:date.or(z.literal('')).optional(),evidenceId:id.nullable().optional()}).strict();
export const governanceCommandSchema=z.discriminatedUnion('module',[
 z.object({module:z.literal('decisions'),command:z.enum(['save','publish','revise','save_revision','publish_revision']),input:decisionInput,requestId:id}).strict(),
 z.object({module:z.literal('compliance'),command:z.enum(['save','approve']),input:requirementInput,requestId:id}).strict(),
]).superRefine((body,c)=>{
 const minimal=body.command==='revise'||body.command==='approve';
 const required=minimal?['revision']:body.module==='decisions'?['title','reason','motivation','scope','owner','sourceKind','sourceId']:['title','subject','sourceKind','sourceId'];
 for(const k of required)if(!Object.hasOwn(body.input,k))c.addIssue({code:'custom',path:['input',k],message:'Dit veld is verplicht.'});
 if(minimal)for(const k of Object.keys(body.input))if(!['id','revision'].includes(k))c.addIssue({code:'custom',path:['input',k],message:'Deze opdracht bewaart geen gewijzigde velden.'});
 if(body.module==='decisions'&&['publish','publish_revision'].includes(body.command)&&body.input.followup&&!body.input.due)c.addIssue({code:'custom',path:['input','due'],message:'Kies een deadline voor de vervolgactie.'});
});
const evidenceSchema=z.object({id,name:z.string(),href:z.string().regex(/^\/api\/files\/dossier-document\//),classification:z.string()});
export const evidenceOptionsSchema=z.object({rows:z.array(evidenceSchema).max(50),selected:evidenceSchema.nullable().optional(),total:z.number().int().nonnegative(),canUpload:z.boolean()});
export type EvidenceOptions=z.infer<typeof evidenceOptionsSchema>;
const decisionBase=z.object({id,title:z.string(),reason:z.string(),motivation:z.string(),scope:z.enum(['general','finance','personnel']),owner_id:id,source_kind:sourceKindSchema,source_id:id,state:z.enum(['draft','final']),version:revision,revision,wants_followup:z.boolean(),followup_action_id:id.nullable()});
const decisionRow=decisionBase.extend({followup:z.object({id,state:z.enum(['open','done']),revision,canModify:z.boolean()}).nullable(),versions:z.array(z.object({version:revision,snapshot:decisionBase,createdAt:stamp})),versionTotal:z.number().int().nonnegative(),history:z.array(z.object({event:z.string(),details:z.object({version:z.number().int().optional(),scope:z.string().optional()}),createdAt:stamp}))});
const requirementBase=z.object({id,title:z.string(),subject:z.string(),owner_id:id.nullable(),source_kind:sourceKindSchema,source_id:id,expires_on:date.nullable(),evidence_id:id.nullable(),revision,followup_action_id:id.nullable()});
const requirementRow=requirementBase.extend({status:z.enum(['Geldig','Verloopt binnenkort','Ontbreekt','Herbeoordeling']),evidence:evidenceSchema.nullable(),versionTotal:z.number().int().nonnegative(),history:z.array(z.object({event:z.string(),snapshot:requirementBase.extend({evidence:evidenceSchema.nullable().optional()}),createdAt:stamp}))});
export type DecisionRow=z.infer<typeof decisionRow>;
export type RequirementRow=z.infer<typeof requirementRow>;
const stateBase=z.object({counts:z.record(z.string(),z.number().int().nonnegative()),total:z.number().int().nonnegative(),page:z.number().int().positive(),pageSize:z.number().int().positive(),historyPage:z.number().int().positive(),canWrite:z.boolean(),scopes:z.array(z.enum(['general','finance','personnel'])),today:date});
const common=z.object({owners:z.array(z.object({id,name:z.string()})),sourceOptions:z.array(z.object({id,kind:sourceKindSchema,label:z.string(),href:z.string().regex(/^\/app(?:\/|$)/)}))});
export type GovernanceCommon=z.infer<typeof common>&{tenantName:string;actorId:string;roleName:string};
export type GovernanceState={module:'decisions';data:z.infer<typeof stateBase>&{rows:DecisionRow[];selected:DecisionRow|null};common:GovernanceCommon}|{module:'compliance';data:z.infer<typeof stateBase>&{rows:RequirementRow[];selected:RequirementRow|null};common:GovernanceCommon};
export function governanceState(module:GovernanceQuery['module'],raw:unknown,rawCommon:unknown,actor:{id:string;tenantName:string;roleName:string}):GovernanceState{
 const projected=common.parse(rawCommon),scopes=stateBase.parse(raw).scopes;projected.sourceOptions=projected.sourceOptions.filter(s=>s.kind!=='personnel'||scopes.includes('personnel'));
 const shared={...projected,tenantName:actor.tenantName,actorId:actor.id,roleName:actor.roleName};
 return module==='decisions'?{module,data:stateBase.extend({rows:z.array(decisionRow),selected:decisionRow.nullable()}).parse(raw),common:shared}:{module,data:stateBase.extend({rows:z.array(requirementRow),selected:requirementRow.nullable()}).parse(raw),common:shared};
}
export const scopeLabels={general:'Algemeen',finance:'Financieel',personnel:'Personeel'} as const;
export const sourceLabel=(data:GovernanceCommon,kind:string,id:string)=>data.sourceOptions.find(s=>s.kind===kind&&s.id===id)?.label||'Dossier';
export const ownerLabel=(data:GovernanceCommon,id:string|null)=>data.owners.find(s=>s.id===id)?.name||(id?'Niet meer actief':'Niet toegewezen');
export function historyLabel(event:string){return({saved:'Concept / bewijs opgeslagen',published:'Besluit vastgesteld',revised:'Nieuwe revisie gestart',approved:'Bewijs beoordeeld en goedgekeurd',owner_assigned:'Verantwoordelijke gewijzigd'})[event]||event}
