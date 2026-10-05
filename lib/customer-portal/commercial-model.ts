import { z } from "zod";
const text=z.string(),id=z.uuid(),version=z.number().int().positive().safe(),cents=z.number().int().nonnegative().safe(),date=z.iso.datetime({offset:true});
const address=z.record(text,text);
export const customerCommercialSchema=z.object({
 request:z.object({id,number:text,subject:text,description:text,status:text,version,objectId:id.nullable(),createdAt:date,canReply:z.boolean()}).strict(),
 events:z.array(z.object({id,kind:text,body:text,at:date,author:text}).strict()),
 quotes:z.array(z.object({id,number:text,revision:version,version,status:text,expiresAt:date.nullable(),supersededAt:date.nullable(),archivedAt:date.nullable(),hasPdf:z.boolean(),canDecide:z.boolean(),snapshot:z.object({
  number:text,revision:version,subject:text,workKind:text,priceBasis:text,expiresAt:date,subtotal:cents,vat:cents,total:cents,terms:address,
  customer:z.object({name:text,number:text,address}).strict(),contact:text,object:z.object({id:id.nullable(),name:text,number:text,address}).strict(),
  supplier:z.object({name:text,primary:text.nullable(),accent:text.nullable(),footer:text,whiteLabel:z.boolean(),hasLogo:z.boolean(),business:address}).strict(),
  lines:z.array(z.object({description:text,quantity:z.number().nonnegative(),unit:text,price:cents,discount:z.number().int(),vat:z.number().int(),net:cents}).strict()),
  taxes:z.array(z.object({rate:z.number().int(),base:cents,tax:cents}).strict()),attachments:z.array(z.object({id,title:text,mime:text}).strict()),
 }).strict().nullable()}).strict()),
}).strict();
export type CustomerCommercial=z.infer<typeof customerCommercialSchema>;
export const customerCommercialCommandSchema=z.discriminatedUnion("command",[
 z.object({command:z.literal("reply"),input:z.object({id,version,body:text.trim().min(3).max(5000)}).strict()}).strict(),
 z.object({command:z.literal("decide"),input:z.object({id,version,revision:version,decision:z.enum(["accepted","rejected","change_requested"]),name:text.trim().min(2).max(180),evidence:text.trim().max(3000),confirmed:z.literal(true)}).strict().refine(v=>v.decision==="accepted"||v.evidence.length>=3,{message:"Geef een korte toelichting.",path:["evidence"]})}).strict(),
]);
export type CustomerCommercialCommand=z.infer<typeof customerCommercialCommandSchema>;
