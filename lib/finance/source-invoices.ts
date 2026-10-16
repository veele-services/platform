import {z} from 'zod';
import type {TenantContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import type {InvoiceResourceActions} from './invoice-resource';
const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const invoiceListQuery=z.object({q:z.string().max(200).default(''),status:z.enum(['','draft','final','sent','partially_paid','paid','overdue','credited','void','concept']).default(''),stage:z.enum(['unpaid','all','concepts','paid']).default('unpaid'),sort:z.enum(['date','date_desc','number','customer','amount','amount_desc','status']).default('date_desc'),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(25)}).strict();
export type InvoiceListQuery=z.infer<typeof invoiceListQuery>;
export const invoicePageQuery=invoiceListQuery.extend({record:z.uuid().optional(),recordKind:z.enum(['invoice','concept']).default('invoice'),recordView:z.enum(['summary','details','payment','finalize']).default('summary'),recordTab:z.enum(['preview','lines','payments']).default('preview')}).strict();
export function invoiceRoute(params:Record<string,unknown>){const parsed=invoicePageQuery.parse(params);const{record,recordKind,recordView,recordTab,...query}=parsed;return{query,record,recordKind,recordView,recordTab}};
export const sourceInvoiceRow=z.object({id:z.uuid(),kind:z.enum(['invoice','concept']),number:z.string(),title:z.string(),customerId:z.uuid(),customer:z.string(),date:z.iso.date(),version:z.number().int().positive(),status:z.enum(['draft','final','sent','partially_paid','paid','overdue','credited','void','concept']),totalCents:cents,paidCents:cents,outstandingCents:cents,overdue:z.boolean(),pdfAvailable:z.boolean(),unpaid:z.boolean()}).strict();
export const sourceInvoiceList=z.object({rows:z.array(sourceInvoiceRow).max(100),total:z.number().int().nonnegative(),page:z.number().int().positive(),pageSize:z.number().int().min(10).max(100),today:z.iso.date(),canSources:z.boolean(),counts:z.object({unpaid:cents,overdue:cents,confirmed:cents.nullable()}).strict()}).strict();
export type SourceInvoiceRow=z.infer<typeof sourceInvoiceRow>;
export type SourceInvoiceList=z.infer<typeof sourceInvoiceList>;
export type SourceInvoiceState=SourceInvoiceList&{actions:InvoiceResourceActions};
export function invoiceActions(tenant:Pick<TenantContext,'roles'|'enabledServices'|'permissions'>):InvoiceResourceActions{
 const write=tenant.enabledServices.includes('finance')&&tenant.roles.some(r=>['tenant_admin','management','finance'].includes(r))&&['backoffice.access','backoffice.finance.read','backoffice.finance.write'].every(p=>hasManagementPermission(tenant,p));
 const cap=(...keys:string[])=>write&&keys.every(k=>hasManagementPermission(tenant,'backoffice.functions.'+k));
 return{finalize:cap('execution_invoice_concepts','create_execution_invoice','attach_invoice_pdf'),send:cap('send_invoice'),bundle:cap('create_payment_bundle'),manualPayment:cap('register_manual_payment'),repair:cap('attach_invoice_pdf')};
}
export const invoiceLabels={draft:'Concept',concept:'Concept',final:'Definitief',sent:'Verzonden',partially_paid:'Deels betaald',paid:'Betaald',overdue:'Vervallen',credited:'Gecrediteerd',void:'Vervallen verklaard'};
export const invoiceLabel=(row:SourceInvoiceRow)=>row.overdue?'Vervallen':invoiceLabels[row.status];
export const invoiceTone=(row:SourceInvoiceRow)=>row.overdue?'warning':row.status==='paid'?'green':'neutral';
export const sourceInvoiceKey=(row:Pick<SourceInvoiceRow,'kind'|'id'>)=>row.kind+':'+row.id;
