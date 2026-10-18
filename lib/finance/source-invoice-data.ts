import 'server-only';
import {z} from 'zod';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {ticketRpc} from '@/lib/tickets/rpc';
import {hasManagementPermission} from '@/lib/management/model';
import {invoiceConceptSchema} from './invoice-concepts';
import {sourceInvoiceList,invoiceActions,type InvoiceListQuery,type SourceInvoiceState} from './source-invoices';
import type {InvoiceResourceData,InvoiceResourceRow,InvoiceResourceActions} from './invoice-resource';
async function resourceRows<T>(read:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){
 const rows:T[]=[];for(let from=0;from<100000;from+=500){const result=await read(from,from+499);if(result.error)throw result.error;const page=result.data??[];rows.push(...page);if(page.length<500)return rows;}throw new Error('Deze selectie is te groot. Open een afzonderlijke factuur.');
}

export async function getSourceInvoices(filters:InvoiceListQuery):Promise<SourceInvoiceState>{
 const {context,db}=await cockpitActor('backoffice.finance.read');
 const data=sourceInvoiceList.parse(await ticketRpc(db,'cockpit_invoice_list',{target_tenant:context.tenant.id,filters}));return {...data,actions:invoiceActions(context.tenant)};
}
export const invoiceResourceQuery=z.object({kind:z.enum(['invoice','concept']),ids:z.array(z.uuid()).min(1).max(100)}).strict().refine(v=>new Set(v.ids).size===v.ids.length,'Selecteer iedere bron één keer.');
/** Selected native resources only. Existing RLS/RPC and document/payment actions
 * retain their authority; no admin client or whole-workspace projection. */
export async function getInvoiceResources(input:z.infer<typeof invoiceResourceQuery>):Promise<{rows:InvoiceResourceRow[];data:InvoiceResourceData;actions:InvoiceResourceActions}>{
 const {context,db}=await cockpitActor('backoffice.finance.read'),tenant=context.tenant;
 if(!tenant.enabledServices.includes('finance')||!tenant.roles.some(r=>['tenant_admin','management','finance'].includes(r))||!hasManagementPermission(tenant,'backoffice.functions.cockpit_invoice_list'))throw Object.assign(new Error('Geen actuele factuurtoegang.'),{code:'42501'});
 const recheck=async()=>{const current=await cockpitActor('backoffice.finance.read');if(current.context.user.id!==context.user.id||current.context.tenant.id!==tenant.id||!current.context.tenant.enabledServices.includes('finance')||!current.context.tenant.roles.some(r=>['tenant_admin','management','finance'].includes(r))||!hasManagementPermission(current.context.tenant,'backoffice.functions.cockpit_invoice_list'))throw Object.assign(new Error('Je actuele factuurtoegang is gewijzigd.'),{code:'42501'});return invoiceActions(current.context.tenant)};
 if(input.kind==='concept'){
  const rows=await Promise.all(input.ids.map(async id=>{const r=await db.rpc('execution_invoice_concepts',{target_tenant:tenant.id,target_order:id});if(r.error)throw r.error;const found=invoiceConceptSchema.array().parse(r.data);if(found.length!==1||found[0].id!==id)throw Object.assign(new Error('Het concept is intussen gewijzigd of niet meer beschikbaar.'),{code:'40001'});return{kind:'concept' as const,item:found[0]}}));
  const actions=await recheck();return {rows,actions,data:{customers:rows.map(r=>({id:r.item.customerId,name:r.item.customer.name})),invoiceLines:[],allocations:[],payments:[]}};
 }
 const invoices=await db.from('invoices').select('*').eq('tenant_id',tenant.id).in('id',input.ids);if(invoices.error)throw invoices.error;if(invoices.data.length!==input.ids.length)throw Object.assign(new Error('Factuur niet beschikbaar.'),{code:'42501'});
 const [lines,allocations]=await Promise.all([resourceRows((from,to)=>db.from('invoice_lines').select('*').eq('tenant_id',tenant.id).in('invoice_id',input.ids).order('created_at').order('id').range(from,to)),resourceRows((from,to)=>db.from('payment_allocations').select('*').eq('tenant_id',tenant.id).in('invoice_id',input.ids).order('allocated_at').order('id').range(from,to))]);
 const attemptIds=[...new Set(allocations.map(item=>item.payment_attempt_id))];
 const payments=attemptIds.length?await resourceRows((from,to)=>db.from('payment_attempts').select('*').eq('tenant_id',tenant.id).in('id',attemptIds).order('created_at',{ascending:false}).order('id').range(from,to)):[];
 const actions=await recheck();return {rows:invoices.data.map(item=>({kind:'invoice',item})),actions,data:{customers:invoices.data.map(i=>({id:i.customer_id,name:typeof i.customer_snapshot==='object'&&i.customer_snapshot&&!Array.isArray(i.customer_snapshot)&&typeof i.customer_snapshot.name==='string'?i.customer_snapshot.name:'Factuurklant'})),invoiceLines:lines,allocations,payments}};
}
