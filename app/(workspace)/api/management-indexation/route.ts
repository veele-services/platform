import {getServerEnv} from '@/lib/env/server';
import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {getIndexation} from '@/lib/management-cockpit/indexation-data';
import {indexationCommandSchema,indexationQuerySchema,indexationEvidenceQuery,indexationEvidenceSchema} from '@/lib/management-cockpit/indexation';
import {crmError} from '@/lib/platform-crm/model';
import {ticketRpc} from '@/lib/tickets/rpc';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Je actuele financiële, eigenaars- of klantdossierrechten staan deze actie niet toe.':status===422?'Controleer percentage, ingangsdatum en het werkelijke klantakkoord met beschikbaar gescand bewijs.':status===409?'Het voorstel of contract is gewijzigd. Laad de actuele versie en beoordeel de oorspronkelijke tarieven en afspraken opnieuw.':'De indexatiewijziging is nog niet bevestigd. Je invoer blijft behouden; herhaal dezelfde aanvraag.'},status)}
export async function GET(request:Request){try{const raw=Object.fromEntries(new URL(request.url).searchParams);if('customerId'in raw){const q=indexationEvidenceQuery.parse(raw),{context,db}=await cockpitActor('backoffice.finance.read');return reply(indexationEvidenceSchema.parse(await ticketRpc(db,'cockpit_indexation_evidence',{target_tenant:context.tenant.id,target_customer:q.customerId,search:q.search,...(q.selected?{selected_evidence:q.selected}:{})})))}return reply(await getIndexation(indexationQuerySchema.parse(raw)))}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Deze wijziging is niet toegestaan.'},403);
 const actor=await cockpitActor('backoffice.finance.read'),{command,input,requestId}=indexationCommandSchema.parse(await readBoundedJson(request,16000));
 return reply(await ticketRpc(actor.db,'cockpit_indexation_command',{target_tenant:actor.context.tenant.id,command,input,request_id:requestId}));
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'Deze invoer is te groot.'},413);return failure(error)}}
