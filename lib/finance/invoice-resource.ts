import type {WorkspaceData} from '@/lib/data/workspace';
import type {InvoiceConcept} from './invoice-concepts';
export type InvoiceResourceRow={kind:'invoice';item:WorkspaceData['invoices'][number]}|{kind:'concept';item:InvoiceConcept};
export type InvoiceResourceModal={type:'view';row:InvoiceResourceRow;tab?:string}|{type:'finalize'|'bundle';rows:InvoiceResourceRow[]};
export type InvoiceResourceData=Pick<WorkspaceData,'invoiceLines'|'allocations'|'payments'>&{customers:Array<{id:string;name:string}>};
export type InvoiceResourceActions={finalize:boolean;send:boolean;bundle:boolean;manualPayment:boolean;repair:boolean};
export type InvoiceResources={rows:InvoiceResourceRow[];data:InvoiceResourceData;actions:InvoiceResourceActions};
export function invoiceOutstanding(invoice:Pick<WorkspaceData['invoices'][number],'status'|'finalized_at'|'total_cents'|'paid_cents'>){return invoice.finalized_at&&['final','sent','partially_paid','overdue'].includes(invoice.status)?Math.max(0,invoice.total_cents-invoice.paid_cents):0}
