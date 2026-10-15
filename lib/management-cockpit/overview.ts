import {z} from 'zod';
import {financeStateSchema} from './finance';
import {slaStateSchema} from './service-levels';
import {projectFollowup,followupQuerySchema,type FollowupAction} from './followup';
import {governanceState} from './governance';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),id=z.uuid();
export const overviewQuerySchema=z.object({period:z.enum(['week','month']).default('week'),detail:z.union([z.literal('all'),z.iso.date()]).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(50).default(20)}).strict();
export type OverviewQuery=z.infer<typeof overviewQuerySchema>;
const visit=z.object({id,sourceId:id,number:z.string(),title:z.string(),date:z.iso.date().nullable(),status:z.string(),orders:count});
const rawSchema=z.object({today:z.iso.date(),asOf:z.string(),timezone:z.string(),from:z.iso.date(),until:z.iso.date(),period:z.enum(['week','month']),graph:z.array(z.object({day:z.iso.date(),name:z.string(),planned:count,executed:count})).min(4).max(7),operational:z.object({active:count,attention:count,completed:count,review:count,planning:count}),attention:z.array(visit).max(7),visits:z.array(visit).max(50),measurementTotal:count,page:z.number().int().positive(),pageSize:z.number().int().positive(),requests:count.nullable(),aging:z.object({current:count,overdue:count}).nullable(),access:z.object({operation:z.boolean(),review:z.boolean(),commercial:z.boolean(),followup:z.boolean(),finance:z.boolean(),sla:z.boolean(),quality:z.boolean(),report:z.boolean()}),followup:z.unknown().optional(),finance:z.unknown().optional(),slaRisk:z.unknown().optional(),slaBreached:z.unknown().optional(),compliance:z.unknown().optional()});
export function overviewState(value:unknown,actor:{id:string;tenantName:string;roleName:string}){
 const raw=rawSchema.parse(value),{followup:followupRaw,finance:financeRaw,slaRisk:slaRiskRaw,slaBreached:slaBreachedRaw,compliance:complianceRaw,...core}=raw;
 const actions=raw.access.followup?projectFollowup(followupRaw,followupQuerySchema.parse({filter:'all',pageSize:5}),actor.tenantName):null;
 const finance=raw.access.finance?financeStateSchema.parse(financeRaw):null;
 const risk=raw.access.sla?slaStateSchema.parse(slaRiskRaw):null,breached=raw.access.sla?slaStateSchema.parse(slaBreachedRaw):null;
 const compliance=raw.access.quality?governanceState('compliance',complianceRaw,followupRaw,actor):null;
 return{...core,tenantName:actor.tenantName,roleName:actor.roleName,actions:actions?.actions.slice(0,4).map(({id,kind,title,customer,owner,originalDue,contextSourceKind,contextSourceId})=>({id,kind,title,customer,owner,due:originalDue,sourceKind:contextSourceKind,sourceId:contextSourceId}))||[],open:actions?.counts.all??null,overdue:actions?.counts.overdue??null,unassigned:actions?.counts.unassigned??null,finance:finance?.counts??null,sla:risk?{...risk.counts,total:risk.counts.onTrack+risk.counts.risk+risk.counts.breached,rows:[...(breached?.rows||[]),...risk.rows].slice(0,5)}:null,compliance:compliance?.module==='compliance'?{count:compliance.data.counts.attention??0,rows:compliance.data.rows.map(({id,title,subject,status})=>({id,title,subject,status}))}:null};
}
export type OverviewState=ReturnType<typeof overviewState>;
export type OverviewVisit=z.infer<typeof visit>;
export type OverviewAction=Pick<FollowupAction,'id'|'kind'|'title'|'owner'|'customer'> & {due:string|null;sourceKind:string;sourceId:string};
