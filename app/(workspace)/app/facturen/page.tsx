import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {getPlanningShellData} from '@/lib/planning/data';
import {invoiceRoute} from '@/lib/finance/source-invoices';
import {getSourceInvoices} from '@/lib/finance/source-invoice-data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {SitesInvoices} from '@/components/fieldgrid/finance/invoices';
export default async function InvoicesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant||!tenant.enabledServices.includes('finance')||!tenant.roles.some(r=>['tenant_admin','management','finance'].includes(r))||!['backoffice.finance.read','backoffice.functions.cockpit_invoice_list'].every(p=>hasManagementPermission(tenant,p)))notFound();
 const raw=await searchParams;let route;try{route=invoiceRoute(Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Array.isArray(v)?v[0]:v])))}catch{notFound()}
 const [data,shell]=await Promise.all([getSourceInvoices(route.query),getPlanningShellData(tenant.id)]);
 return <BackofficeShell context={{...context,tenant}} data={shell} initialView="facturen" presentation="sites-management"><SitesInvoices tenant={tenant} userId={context.user.id} initial={data}/></BackofficeShell>;
}
