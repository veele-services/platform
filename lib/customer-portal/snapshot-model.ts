import { z } from "zod";
import { customerBaseSnapshotSchema } from "./model";
import { customerInvoiceSchema,customerReportSchema,customerRequestSchema,customerServiceSchema,customerNewsSchema,customerTicketSchema,customerActivitySchema,customerDocumentSchema } from "./presentation";

/** Domain summaries only; notification/ticket integrations have their own
 * projections. Missing integrations must not be represented as invented data. */
export const customerCoreSnapshotSchema=customerBaseSnapshotSchema.extend({
 invoices:z.array(customerInvoiceSchema),reports:z.array(customerReportSchema),documents:z.array(customerDocumentSchema),
 requests:z.array(customerRequestSchema),services:z.array(customerServiceSchema),news:z.array(customerNewsSchema),
 tickets:z.array(customerTicketSchema),activity:z.object({items:z.array(customerActivitySchema),unread:z.number().int().nonnegative().safe()}).strict(),
 now:z.iso.datetime({offset:true}),
}).strict().superRefine((value,ctx)=>{
 const objects=new Set(value.workspace.objects.map(object=>object.id));
 for(const [index,invoice] of value.invoices.entries())if(!invoice.objectIds.length||invoice.objectIds.some(id=>!objects.has(id)))
  ctx.addIssue({code:"custom",path:["invoices",index],message:"Factuurscope is gewijzigd."});
 for(const [index,report] of value.reports.entries())if(!objects.has(report.objectId))
  ctx.addIssue({code:"custom",path:["reports",index],message:"Rapportscope is gewijzigd."});
 for(const [index,request] of value.requests.entries()){
  const selected=new Set(request.objectIds),parts=request.parts.filter(part=>part.objectId!==null);
  if(request.objectIds.some(id=>!objects.has(id))||parts.some(part=>!selected.has(part.objectId!))||[...selected].some(id=>!parts.some(part=>part.objectId===id)))
   ctx.addIssue({code:"custom",path:["requests",index],message:"Aanvraagscope is gewijzigd."});
 }
 if(!value.workspace.tenant.planning&&(value.requests.length||value.services.length))ctx.addIssue({code:"custom",message:"Planningsmodule is gewijzigd."});
 if(!value.workspace.tenant.finance&&value.invoices.length)ctx.addIssue({code:"custom",message:"Factuurmodule is gewijzigd."});
 if((!value.workspace.tenant.planning||!value.workspace.tenant.reports)&&value.reports.length)ctx.addIssue({code:"custom",message:"Rapportmodule is gewijzigd."});
});
export type CustomerCoreSnapshot=z.infer<typeof customerCoreSnapshotSchema>;

export class CustomerSnapshotError extends Error {
 constructor(public readonly status:403|409|503,message:string){super(message);this.name="CustomerSnapshotError";}
}
