import {z} from 'zod';
import {saveWorkOrderSchema,type SaveWorkOrderInput,type WorkOrderDossier,type WorkOrderListRow} from './model';
import {executionLabels} from '@/lib/dossiers/status';

export const sourceExecutionLabel=(status:string)=>(({in_progress:'Bezig',under_review:'Te controleren',correction_required:'Correctie nodig'} as Record<string,string>)[status]??executionLabels[status]??'Status onbekend');
export const sourceReportLabels:Record<string,string>={draft:'Nog niet ingediend',waiting_signature:'Wacht op handtekening',review:'Te controleren',correction:'Correctie nodig',approved:'Goedgekeurd'};
export function sourceWorkOrderTone(status:string){return ['approved','invoice_ready','invoiced','completed'].includes(status)?'green':['returned','correction_required','cancelled'].includes(status)?'red':['under_review','in_progress','waiting_signature','review','correction'].includes(status)?'amber':'neutral'}

export const reportReviewQuery=z.object({
 q:z.string().max(200).default(''),status:z.enum(['','draft','waiting_signature','review','correction','approved']).default(''),
 stage:z.enum(['','open','processed']).default(''),sort:z.enum(['date','date_desc','number','customer','status']).default('date_desc'),
 page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(25),
}).strict();
export type ReportReviewQuery=z.infer<typeof reportReviewQuery>;
export type ReportReviewRow=WorkOrderListRow&{updatedAt:string;reportVersion:number;legacy:boolean};
export type ReportReviewList={rows:ReportReviewRow[];total:number;page:number;pageSize:number};

/** The compact source editor changes metadata only. Round-trip every original
 * business binding and keep native immutable task/commercial snapshots intact. */
export function sourceWorkOrderMetadata(dossier:WorkOrderDossier,patch:{title:string;description:string;mutationId:string;confirmedWarnings?:string[]}):SaveWorkOrderInput{
 const w=dossier.order;
 return saveWorkOrderSchema.parse({id:w.id,version:w.version,mutationId:patch.mutationId,customerId:w.customerId,objectId:w.objectId,
  title:patch.title,description:patch.description,discipline:w.discipline,priority:w.priority,labels:w.labels,locationLabel:w.locationLabel,
  plannerId:w.plannerId,leadPersonnelId:w.leadPersonnelId,customerReference:w.customerReference,purchaseOrder:w.purchaseOrder,costCenter:w.costCenter,
  deadline:w.deadline,requestedDate:w.requestedDate,windowStart:w.windowStart,windowEnd:w.windowEnd,windowKind:w.windowKind,
  requiredPersonnel:w.requiredPersonnel,durationMinutes:w.durationMinutes,instructions:w.instructions,
  contacts:dossier.contacts.map(c=>({id:c.id,roles:c.roles})),preserveTasks:true,tasks:[],templateRevisionId:w.templateRevisionId,
  checklistRevisionIds:dossier.checklists.map(c=>c.revisionId),signatureMode:w.signatureMode,employeeSignatureRequired:w.employeeSignatureRequired,
  state:w.planningState,start:w.start,end:w.end,assignments:dossier.assignments.filter(a=>a.status!=='cancelled').map(a=>({personnelId:a.personnelId,start:a.start,end:a.end})),
  confirmedWarnings:patch.confirmedWarnings??[],
 });
}
