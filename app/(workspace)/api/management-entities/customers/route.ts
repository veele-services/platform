import {crmError} from '@/lib/platform-crm/model';
import {customerFilters} from '@/lib/customers/model';
import {getCustomerCards} from '@/lib/management-cockpit/entities-data';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(request:Request){try{const filters=customerFilters.strict().parse(Object.fromEntries(new URL(request.url).searchParams));return reply(await getCustomerCards(filters))}catch(error){const mapped=crmError(error);return reply({ok:false,error:mapped.status===403?'Deze klantenlijst is niet beschikbaar binnen je actuele rechten.':mapped.error},mapped.status)}}
