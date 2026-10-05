import { z } from "zod";
import { customerVisitSchema } from "./model";
const id=z.uuid(),text=z.string(),version=z.number().int().positive().safe(),moment=z.iso.datetime({offset:true});
export const customerVisitProposalSchema=z.object({id,version,title:text,scope:text,quantity:z.number().positive(),priceCents:z.number().int().nonnegative().safe(),vatBasisPoints:z.number().int().nonnegative().max(10000),acceptedAt:moment.nullable(),canAccept:z.boolean()}).strict();
export const customerVisitRequestSchema=z.object({id,nodeId:id.nullable(),title:text,body:text,kind:z.enum(["attention","change","problem","extra"]),priority:z.enum(["normal","high","urgent"]),feedback:text,status:text,version,
 createdAt:moment,updatedAt:moment,author:text,response:text,canEdit:z.boolean(),canWithdraw:z.boolean(),read:z.boolean(),
 documents:z.array(z.object({id,title:text,version,mime:text}).strict()),proposals:z.array(customerVisitProposalSchema),
}).strict();
export const customerVisitDetailSchema=z.object({visit:customerVisitSchema,canAddRequest:z.boolean(),tasks:z.array(text),
 nodes:z.array(z.object({id,name:text}).strict()),requests:z.array(customerVisitRequestSchema),
}).strict();
export type CustomerVisitDetail=z.infer<typeof customerVisitDetailSchema>;
export const customerVisitNoteInputSchema=z.object({accountId:id,visitId:id,version,body:text.trim().min(2).max(10000),commandId:id}).strict();

const requestLabels:Record<string,string>={received:"Ontvangen",new:"Ontvangen",review:"In behandeling",regular:"Ingepland binnen de afspraak",proposal:"Voorstel beschikbaar",accepted:"Akkoord ontvangen",rejected:"Niet aangenomen",withdrawn:"Ingetrokken",completed:"Afgerond",partial:"Deels uitgevoerd",not_done:"Niet uitgevoerd",closed:"Gesloten"};
export const customerVisitRequestLabel=(status:string)=>requestLabels[status]??"In behandeling";
