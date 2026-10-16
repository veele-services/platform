import {crmError} from '@/lib/platform-crm/model';
import {entityQuerySchema} from '@/lib/management-cockpit/entities';
import {getEntityDetail} from '@/lib/management-cockpit/entities-data';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(request:Request){try{const{kind,id}=entityQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));return reply(await getEntityDetail(kind,id))}catch(error){const mapped=crmError(error);return reply({ok:false,error:mapped.status===403?'Dit dossier is niet beschikbaar binnen je actuele rechten.':mapped.error},mapped.status)}}
