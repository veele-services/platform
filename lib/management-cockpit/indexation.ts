import {z} from 'zod';
const id=z.uuid(),cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),revision=z.number().int().positive();
export const indexationStatuses=['Concept','Ter goedkeuring','Goedgekeurd','Verwerkt'] as const;
export const indexationQuerySchema=z.object({filter:z.enum(['Alle voorstellen',...indexationStatuses]).default('Alle voorstellen'),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(100).default(20),record:id.optional(),contractSearch:z.string().trim().max(160).default(''),contractId:id.optional()}).strict();
const selected=z.object({id,revision}),percent=z.number().min(0).max(25).multipleOf(0.01);
export const indexationCommandSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('save'),input:z.object({id,revision:revision.optional(),agreementId:id,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),percent,effective:z.iso.date()}).strict(),requestId:id}).strict(),
 z.object({command:z.enum(['submit','return','approve']),input:selected.strict(),requestId:id}).strict(),
 z.object({command:z.literal('process'),input:selected.extend({evidenceId:id,acceptedBy:z.string().trim().min(2).max(160),acceptedOn:z.iso.date(),confirmed:z.literal(true)}).strict(),requestId:id}).strict(),
]);
export const indexationRow=z.object({id,agreementId:id,customerId:id,customer:z.string(),contract:z.string(),baseCents:cents,newCents:cents,percent,effective:z.iso.date(),status:z.enum(indexationStatuses),revision,version:revision,sourceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),sourceChanged:z.boolean(),processedAgreementId:id.nullable(),history:z.array(z.object({event:z.string(),createdAt:z.string(),version:revision,actor:z.string()})).max(50),historyTotal:z.number().int().nonnegative()});
export const indexationStateSchema=z.object({rows:z.array(indexationRow).max(100),selected:indexationRow.nullable(),total:z.number().int().nonnegative(),page:revision,pageSize:revision,canWrite:z.boolean(),isOwner:z.boolean(),canProcess:z.boolean(),today:z.iso.date(),timezone:z.string(),contractsTotal:z.number().int().nonnegative(),contracts:z.array(z.object({id,customerId:id,customer:z.string(),label:z.string(),baseCents:cents,lines:z.array(z.object({quantity:z.number().positive(),priceCents:cents})).max(100),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)})).max(100)});
export type IndexationState=z.infer<typeof indexationStateSchema>;
export type IndexationRow=z.infer<typeof indexationRow>;
export type IndexationQuery=z.infer<typeof indexationQuerySchema>;
export type IndexationCommand=z.infer<typeof indexationCommandSchema>;
export const indexationEvidenceQuery=z.object({customerId:id,selected:id.optional(),search:z.string().trim().max(160).default('')}).strict();
const file=z.object({id,name:z.string(),href:z.string().regex(/^\/api\/files\/dossier-document\//),classification:z.string()});
export const indexationEvidenceSchema=z.object({rows:z.array(file).max(50),selected:file.nullable(),total:z.number().int().nonnegative()});
export type IndexationEvidence=z.infer<typeof indexationEvidenceSchema>;
