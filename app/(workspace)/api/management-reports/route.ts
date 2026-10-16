import {getServerEnv} from '@/lib/env/server';
import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {getReports} from '@/lib/management-cockpit/reports-data';
import {reportCommandSchema,reportQuerySchema} from '@/lib/management-cockpit/reports';
import {crmError} from '@/lib/platform-crm/model';
import {ticketRpc} from '@/lib/tickets/rpc';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Je actuele rapportage- of bronrechten staan deze actie niet toe.':status===422?'Controleer rapportperiode, toelichting en planning.':status===409?'De planning is gewijzigd. Laad de actuele versie.':'Het rapportverzoek is nog niet bevestigd. Je invoer blijft behouden; herhaal dezelfde aanvraag.'},status)}
export async function GET(request:Request){try{return reply(await getReports(reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))))}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Deze wijziging is niet toegestaan.'},403);
 const actor=await cockpitActor('backoffice.reports.read'),{command,input,requestId}=reportCommandSchema.parse(await readBoundedJson(request,24000));
 return reply(await ticketRpc(actor.db,'cockpit_reports_command',{target_tenant:actor.context.tenant.id,command,input,request_id:requestId}));
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'Deze invoer is te groot.'},413);return failure(error)}}
