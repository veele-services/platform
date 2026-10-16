import {cockpitActor} from '@/lib/management-cockpit/data';
import {hasManagementPermission,managementSnapshotSchema} from '@/lib/management/model';
import {managementRpc} from '@/lib/management/rpc';
import {crmError} from '@/lib/platform-crm/model';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(request:Request){
 try{
  if(new URL(request.url).search)return reply({error:'Ongeldige selectie.'},422);
  const actor=await cockpitActor('management.users.read'),tenant=actor.context.tenant;
  if(!tenant.roles.some(r=>r!=='staff')||!hasManagementPermission(tenant,'backoffice.access'))return reply({error:'Geen actuele toegang tot gebruikersbeheer.'},403);
  const snapshot=managementSnapshotSchema.parse(await managementRpc(actor.db,'management_query',{target_tenant:tenant.id}));
  const current=await cockpitActor('management.users.read');
  if(current.context.user.id!==actor.context.user.id||current.context.tenant.id!==tenant.id||!current.context.tenant.roles.some(r=>r!=='staff')||!hasManagementPermission(current.context.tenant,'backoffice.access'))return reply({error:'Je actuele toegang is gewijzigd.'},403);
  snapshot.canManage=snapshot.canManage&&hasManagementPermission(current.context.tenant,'management.users.manage');
  return reply({snapshot,enabledServices:current.context.tenant.enabledServices});
 }catch(e){const r=crmError(e);return reply({error:r.status===403?'Geen actuele toegang tot gebruikersbeheer.':r.error},r.status)}
}
