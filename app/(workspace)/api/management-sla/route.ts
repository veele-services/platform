import {getServerEnv} from '@/lib/env/server';
import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {getServiceLevels} from '@/lib/management-cockpit/service-levels-data';
import {slaCommandSchema,slaQuerySchema} from '@/lib/management-cockpit/service-levels';
import {crmError} from '@/lib/platform-crm/model';
import {ticketRpc} from '@/lib/tickets/rpc';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Je actuele rechten staan dit SLA-overzicht of deze actie niet toe.':status===422?'Controleer de bron en norm. Gebruik bijvoorbeeld: binnen 4 werkuren, binnen 30 werkminuten of 4 bezoeken in de meetperiode.':status===409?'De bron of ticketstatus is gewijzigd. Laad de actuele gegevens en controleer de gekozen gebeurtenis.':'De wijziging kon nog niet worden bevestigd. Je invoer blijft behouden; probeer dezelfde aanvraag opnieuw.'},status)}
export async function GET(request:Request){try{return reply(await getServiceLevels(slaQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))))}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({ok:false,error:'Deze wijziging is niet toegestaan.'},403);
 const actor=await cockpitActor(),{command,input,requestId}=slaCommandSchema.parse(await readBoundedJson(request,16000));
 await ticketRpc(actor.db,'cockpit_sla_command',{target_tenant:actor.context.tenant.id,command,input,request_id:requestId});return reply({ok:true});
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'Deze invoer is te groot.'},413);return failure(error)}}
