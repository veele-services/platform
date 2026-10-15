import {getOverview} from '@/lib/management-cockpit/overview-data';
import {overviewQuerySchema} from '@/lib/management-cockpit/overview';
import {crmError} from '@/lib/platform-crm/model';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Dit overzicht is niet beschikbaar binnen je actuele rechten.':status===422?'Kies een periode en meetgroep uit het overzicht.':status===409?'Het overzicht is gewijzigd. Laad de actuele versie.':'Het actuele overzicht kon nog niet worden geladen. Probeer het opnieuw.'},status)}
export async function GET(request:Request){try{return reply(await getOverview(overviewQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))))}catch(error){return failure(error)}}
