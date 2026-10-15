import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {governanceState,type GovernanceQuery} from './governance';
export async function loadGovernance(actor:Awaited<ReturnType<typeof cockpitActor>>,query:GovernanceQuery){
 const{db,context}=actor,{module,...payload}=query;
 const[raw,common]=await Promise.all([ticketRpc(db,'cockpit_governance_query',{target_tenant:context.tenant.id,module,payload}),ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id})]);
 return governanceState(module,raw,common,{id:context.user.id,tenantName:context.tenant.name,roleName:context.tenant.managementRole||'Management'});
}
export async function getGovernance(query:GovernanceQuery){return loadGovernance(await cockpitActor(),query)}
