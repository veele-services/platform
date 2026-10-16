import {crmError} from '@/lib/platform-crm/model';
import {invoiceListQuery} from '@/lib/finance/source-invoices';
import {getSourceInvoices,getInvoiceResources,invoiceResourceQuery} from '@/lib/finance/source-invoice-data';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(request:Request){
 try{
  const params=new URL(request.url).searchParams;
  if(params.has('kind')){const raw=Object.fromEntries(params);return reply(await getInvoiceResources(invoiceResourceQuery.parse({...raw,ids:raw.ids?.split(',')})))}
  return reply(await getSourceInvoices(invoiceListQuery.parse(Object.fromEntries(params))));
 }catch(e){const mapped=crmError(e);return reply({ok:false,error:mapped.status===403?'Facturen zijn niet beschikbaar binnen je actuele rechten.':mapped.error},mapped.status)}
}
