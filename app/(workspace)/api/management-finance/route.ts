import {getServerEnv} from '@/lib/env/server';
import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {getFinance} from '@/lib/management-cockpit/finance-data';
import {financeCommandSchema,financeQuerySchema} from '@/lib/management-cockpit/finance';
import {crmError} from '@/lib/platform-crm/model';
import {ticketRpc} from '@/lib/tickets/rpc';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Je actuele financiële of rapportcontrolerechten staan deze actie niet toe.':status===422?'Controleer de bron, uitkomst en onderbouwing.':status===409?'De bron is gewijzigd of voldoet nog niet aan de bestaande rapport- en prijscontrole. Open de actuele werkbon en beoordeel de uitvoering, goedkeuring en resthoeveelheid opnieuw.':'De financiële wijziging kon nog niet worden bevestigd. Je invoer blijft behouden; herhaal dezelfde aanvraag.'},status)}
export async function GET(request:Request){try{return reply(await getFinance(financeQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))))}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Deze wijziging is niet toegestaan.'},403);
 const actor=await cockpitActor('backoffice.finance.read'),{input,requestId}=financeCommandSchema.parse(await readBoundedJson(request,20000));
 return reply(await ticketRpc(actor.db,'cockpit_finance_command',{target_tenant:actor.context.tenant.id,input,request_id:requestId}));
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'Deze onderbouwing is te groot.'},413);return failure(error)}}
