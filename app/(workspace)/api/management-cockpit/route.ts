import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {ticketRpc} from '@/lib/tickets/rpc';
import {getServerEnv} from '@/lib/env/server';
import {crmError} from '@/lib/platform-crm/model';
import {cockpitActor,getFollowup,getFollowupDetail} from '@/lib/management-cockpit/data';
import {followupQuerySchema,followupCommandSchema,followupDetailSchema} from '@/lib/management-cockpit/followup';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const mapped=crmError(error);return reply({ok:false,error:mapped.status===403?'Je actuele rechten geven geen toegang tot deze managementactie.':mapped.error},mapped.status)}
export async function GET(request:Request){try{const params=Object.fromEntries(new URL(request.url).searchParams);return reply('id'in params?await getFollowupDetail(followupDetailSchema.parse(params)):await getFollowup(followupQuerySchema.parse(params)))}catch(error){return failure(error)}}
export async function POST(request:Request){
 try{
  const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
  if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Deze opdracht is niet toegestaan.'},403);
  const{context,db}=await cockpitActor(),{requestId,command,input}=followupCommandSchema.parse(await readBoundedJson(request,16000));
  return reply(await ticketRpc(db,'cockpit_followup_command',{target_tenant:context.tenant.id,command,input,request_id:requestId}));
 }catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'De invoer is te groot; er is niets opgeslagen.'},413);return failure(error)}
}
