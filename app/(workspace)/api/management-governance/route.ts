import {z} from 'zod';
import {readBoundedJson,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {getServerEnv} from '@/lib/env/server';
import {ticketRpc} from '@/lib/tickets/rpc';
import {crmError} from '@/lib/platform-crm/model';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {getGovernance} from '@/lib/management-cockpit/governance-data';
import {governanceQuerySchema,governanceCommandSchema,governanceEvidenceQuerySchema,evidenceOptionsSchema} from '@/lib/management-cockpit/governance';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){const{status}=crmError(error);return reply({ok:false,error:status===403?'Je actuele rechten geven geen toegang tot deze bron of beheeractie.':status===409?'Deze registratie is intussen gewijzigd of vereist eerst een geldige beoordeling. Laad de laatste versie en controleer de gegevens.':status===422||error instanceof z.ZodError?'Controleer de verplichte velden, de gekoppelde bron en het bewijs.':'De wijziging is nog niet bevestigd. Je invoer blijft behouden; probeer dezelfde opdracht opnieuw.'},status)}
export async function GET(request:Request){try{
 const raw=Object.fromEntries(new URL(request.url).searchParams);
 if('sourceKind'in raw){const input=governanceEvidenceQuerySchema.parse(raw),{context,db}=await cockpitActor();return reply(evidenceOptionsSchema.parse(await ticketRpc(db,'cockpit_evidence_options',{target_tenant:context.tenant.id,source_kind:input.sourceKind,source_id:input.sourceId,search:input.search,...(input.selected?{selected_evidence:input.selected}:{})})))}
 return reply(await getGovernance(governanceQuerySchema.parse(raw)));
}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 if(request.headers.get('origin')!==expected.origin||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Deze opdracht is niet toegestaan.'},403);
 const{context,db}=await cockpitActor(),{module,command,input,requestId}=governanceCommandSchema.parse(await readBoundedJson(request,48000));
 return reply(await ticketRpc(db,'cockpit_governance_command',{target_tenant:context.tenant.id,module,command,input,request_id:requestId}));
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'De invoer is te groot; deze opdracht is niet uitgevoerd.'},413);return failure(error)}}
