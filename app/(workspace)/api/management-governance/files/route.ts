import {z} from 'zod';
import {getServerEnv} from '@/lib/env/server';
import {readBoundedRequestBody,RequestBodyTooLargeError} from '@/lib/http/request-body';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {ticketRpc} from '@/lib/tickets/rpc';
import {crmError} from '@/lib/platform-crm/model';
import {uploadObjectDocument} from '@/app/(workspace)/app/objecten/actions';
import {uploadCustomerDocument} from '@/app/(workspace)/app/operations-actions';
import {uploadDossierDocument} from '@/app/(workspace)/app/personeel/dossier-actions';
const schema=z.object({requestId:z.uuid(),sourceKind:z.enum(['customer','object','personnel']),sourceId:z.uuid(),title:z.string().trim().min(2).max(160),expiresOn:z.iso.date().or(z.literal('')).default(''),privacyConfirmed:z.enum(['on','off']).default('off')}).strict();
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export async function POST(request:Request){let committed=false;try{
 const expected=new URL(getServerEnv().APP_URL);expected.host=request.headers.get('host')||'';
 const media=request.headers.get('content-type')||'';
 if(request.headers.get('origin')!==expected.origin||!media.toLowerCase().startsWith('multipart/form-data;'))return reply({ok:false,error:'Deze upload is niet toegestaan.'},403);
 const{db,context}=await cockpitActor();
 const form=await new Response(new Blob([new Uint8Array(await readBoundedRequestBody(request,10485760+65536))]),{headers:{'content-type':media}}).formData(),file=form.get('document');
 const raw=Object.fromEntries([...form].filter(([key])=>key!=='document')),input=schema.parse(raw);
 if(!(file instanceof File)||file.size<1||file.size>10485760)return reply({ok:false,error:'Kies PDF, JPG of PNG van maximaal 10 MB.'},422);
 await ticketRpc(db,'cockpit_governance_upload_allowed',{target_tenant:context.tenant.id,source_kind:input.sourceKind,source_id:input.sourceId});
 const upload=new FormData();upload.set('document',file);upload.set('title',input.title);upload.set('requestId',input.requestId);upload.set('previousId','');
 if(input.sourceKind==='object'){
  for(const[k,v]of Object.entries({objectId:input.sourceId,category:'other',nodeId:'',recordId:'',orderId:'',validUntil:input.expiresOn,service:''}))upload.set(k,v);
 }else if(input.sourceKind==='customer'){
  for(const[k,v]of Object.entries({customerId:input.sourceId,category:'other',documentOn:'',validUntil:input.expiresOn}))upload.set(k,v);
 }else{
  if(input.privacyConfirmed!=='on')return reply({ok:false,error:'Bevestig eerst dat dit document in het vertrouwelijke personeelsdossier thuishoort.'},422);
  for(const[k,v]of Object.entries({personnelId:input.sourceId,category:'certificate',relatedId:'',documentDate:'',expiresOn:input.expiresOn,retention:'Nog te beoordelen',privacyConfirmed:'on'}))upload.set(k,v);
 }
 const result=await(input.sourceKind==='object'?uploadObjectDocument:input.sourceKind==='customer'?uploadCustomerDocument:uploadDossierDocument)(upload);
 if(!result.ok)return reply(result,422);committed=true;
 await ticketRpc(db,'cockpit_governance_upload_allowed',{target_tenant:context.tenant.id,source_kind:input.sourceKind,source_id:input.sourceId});
 const entry=await db.from('dossier_documents').select('id').eq('tenant_id',context.tenant.id).eq('source_kind',input.sourceKind).eq('source_id',input.requestId).single();
 if(entry.error||!entry.data)throw new Error('Dossierregistratie kon niet worden bevestigd.');
 return reply({ok:true,id:entry.data.id,name:file.name});
}catch(error){if(error instanceof RequestBodyTooLargeError)return reply({ok:false,error:'De upload is te groot. Gebruik een bestand van maximaal 10 MB.'},413);const{status}=crmError(error);return reply({ok:false,committed,error:committed?'Het bestand staat in het brondossier. De koppeling kon nog niet worden bevestigd; laad de actuele documenten voordat je opnieuw uploadt.':status===403?'Je actuele rechten staan deze upload niet toe.':status===422?'Controleer het bestand en de verplichte velden.':'De upload kon nog niet worden bevestigd. Je invoer blijft behouden; probeer dezelfde upload opnieuw.'},status)}}
