import { z } from "zod";
const id=z.uuid(),text=z.string(),version=z.number().int().positive(),date=z.iso.datetime({offset:true});
export const customerTicketDetailSchema=z.object({id,number:text,subject:text,route:z.enum(["tenant","platform"]),status:text,categoryId:id,version,objectId:id.nullable(),updatedAt:date,canReply:z.boolean(),canClose:z.boolean(),canReopen:z.boolean(),canCancel:z.boolean(),messages:z.array(z.object({id,body:text,own:z.boolean(),author:text,at:date,files:z.array(z.object({id,name:text,mime:text,size:z.number().int().positive(),status:text,scanState:z.enum(["pending","processing","clean","rejected","error"]),createdAt:date}).strict())}).strict())}).strict();
export const customerTicketOptionsSchema=z.array(z.object({id,name:text,route:z.enum(["tenant","platform"])}).strict());
export type CustomerTicketDetail=z.infer<typeof customerTicketDetailSchema>;
export type CustomerTicketOptions=z.infer<typeof customerTicketOptionsSchema>;
export const customerTicketCommandSchema=z.discriminatedUnion("command",[
 z.object({command:z.literal("create"),input:z.object({category_id:id,title:text.trim().min(3).max(180),body:text.trim().min(3).max(20000),object_id:id.nullable(),attachment_ids:z.array(id).max(5)}).strict()}).strict(),
 z.object({command:z.literal("reply"),input:z.object({ticket_id:id,expected_revision:version,body:text.trim().min(3).max(20000),attachment_ids:z.array(id).max(5)}).strict()}).strict(),
 z.object({command:z.literal("status"),input:z.object({ticket_id:id,expected_revision:version,status:z.enum(["closed","cancelled","in_progress"]),reason:text.trim().max(2000)}).strict()}).strict(),
]);
export type CustomerTicketCommand=z.infer<typeof customerTicketCommandSchema>;
