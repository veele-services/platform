import { z } from "zod";
import type { CustomerVisit } from "./model";

const id=z.uuid(),text=z.string(),cents=z.number().int().nonnegative().safe(),moment=z.iso.datetime({offset:true}),version=z.number().int().positive().safe();
export const customerInvoiceSchema=z.object({id,number:text,description:text,objectIds:z.array(id),issuedOn:z.iso.date(),dueOn:z.iso.date(),total:cents,paid:cents,credited:cents,balance:cents,
 status:z.enum(["sent","partially_paid","paid","overdue","credited"]),hasPdf:z.boolean(),paymentInvoiceIds:z.array(id).nullable().optional(),paymentPending:z.boolean()}).strict();
export type CustomerInvoice=z.infer<typeof customerInvoiceSchema>;
export const customerDocumentSchema=z.object({id,title:text,version,category:text,date:z.iso.date().nullable(),validUntil:z.iso.date().nullable()}).strict();
export const customerReportSchema=z.object({id,visitId:id,objectId:id,number:text,title:text,approvedAt:moment,version,summary:text,
 tasks:z.array(z.object({name:text,result:text,quantity:z.number().nonnegative(),unit:text}).strict())}).strict();
export type CustomerReport=z.infer<typeof customerReportSchema>;
export const customerRequestSchema=z.object({id,number:text,subject:text,description:text,status:text,objectIds:z.array(id),createdAt:moment,frequency:text,preferredOn:z.iso.date().nullable(),
 parts:z.array(z.object({id,number:text,objectId:id.nullable(),status:text}).strict())}).strict();
export type CustomerRequest=z.infer<typeof customerRequestSchema>;
export const customerTicketSchema=z.object({id,number:text,subject:text,route:z.enum(["tenant","platform"]),status:text,lastMessage:text,updatedAt:moment}).strict();
export type CustomerTicket=z.infer<typeof customerTicketSchema>;
export const customerNewsSchema=z.object({id,title:text,summary:text,body:text,category:text,createdAt:moment,readAt:moment.nullable(),version,ackRequired:z.boolean(),acknowledgedAt:moment.nullable()}).strict();
export type CustomerNews=z.infer<typeof customerNewsSchema>;
export const customerActivitySchema=z.object({id,title:text,summary:text,createdAt:moment,readAt:moment.nullable(),version,targetPath:z.string().regex(/^\/klant(?:[/?]|$)/).nullable()}).strict();
export type CustomerActivity=z.infer<typeof customerActivitySchema>;
export const customerServiceSchema=z.object({name:text,description:text}).strict();
export const customerResourcesSchema=z.object({invoices:z.array(customerInvoiceSchema),reports:z.array(customerReportSchema),documents:z.array(customerDocumentSchema),requests:z.array(customerRequestSchema),tickets:z.array(customerTicketSchema),news:z.array(customerNewsSchema),activity:z.array(customerActivitySchema),
 services:z.array(customerServiceSchema),unread:z.number().int().nonnegative().safe(),paymentEnabled:z.boolean(),now:moment}).strict();
export type CustomerResources=z.infer<typeof customerResourcesSchema>;

export const customerVisitFinished=(visit:CustomerVisit)=>["completed","returned","under_review","approved","invoice_ready","invoiced"].includes(visit.status);
export const customerVisitLabel=(visit:CustomerVisit)=>customerVisitFinished(visit)?"Uitgevoerd":visit.status==="in_progress"?"In uitvoering":visit.status==="travelling"?"Onderweg":"Bevestigd";
export const customerInvoiceLabel=(invoice:CustomerInvoice)=>invoice.status==="credited"?"Gecrediteerd":invoice.balance===0?"Betaald":invoice.paymentPending?"Wacht op bevestiging":invoice.paid>0?"Deels betaald":"Openstaand";
export const customerInvoicePayable=(invoice:CustomerInvoice)=>invoice.balance>0&&invoice.status!=="credited"&&!invoice.paymentPending;
export const customerInvoiceOverdue=(invoice:CustomerInvoice,today:string)=>invoice.balance>0&&invoice.status!=="credited"&&invoice.dueOn<today;
export function customerInitials(name:string){return name.trim().split(/\s+/).filter(Boolean).map(word=>word[0]).slice(0,2).join("").toUpperCase()||"K";}
export function customerDate(value:string|null,timezone:string,long=false){return value?new Intl.DateTimeFormat("nl-NL",{timeZone:timezone,day:"numeric",month:long?"long":"short",...(long?{weekday:"long" as const}:{}),year:long?"numeric":undefined}).format(new Date(value.length===10?`${value}T12:00:00Z`:value)):"Nog af te stemmen";}
export function customerTime(value:string|null,timezone:string){return value?new Intl.DateTimeFormat("nl-NL",{timeZone:timezone,hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"—";}
