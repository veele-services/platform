import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {followupRawSchema,projectFollowupSource} from './followup';
import {entityWireSchema,type EntityKind,type EntityDetail} from './entities';
import type {CustomerCards} from './entities';
import type {CustomerFilters} from '@/lib/customers/model';
export async function getCustomerCards(filters:CustomerFilters):Promise<CustomerCards>{const{context,db}=await cockpitActor('backoffice.customers.read');return await ticketRpc(db,'cockpit_customer_cards',{target_tenant:context.tenant.id,filters}) as CustomerCards}
export async function getEntityDetail(kind:EntityKind,id:string):Promise<EntityDetail>{
 const capabilityModule={customer:'customers',object:'objects',personnel:'personnel'}[kind],{context,db}=await cockpitActor('backoffice.'+capabilityModule+'.read');
 const wire=entityWireSchema.parse(await ticketRpc(db,'cockpit_entity_query',{target_tenant:context.tenant.id,source_kind:kind,source_id:id}));
 let followup:EntityDetail['followup']=null;
 if(wire.followup){const raw=followupRawSchema.parse(wire.followup);if(raw.sourceOptions.some(s=>s.id===id&&s.kind===kind))followup=projectFollowupSource(raw,{sourceKind:kind,sourceId:id,page:1},context.tenant.name)}
 // Keep the original personnel dossier view audit on this additional API entry.
 // Private HR records, birth dates and storage paths never enter this DTO.
 if(kind==='personnel'&&wire.access.documents){const{error}=await db.from('personnel_dossier_access').insert({tenant_id:context.tenant.id,personnel_id:id,actor_user_id:context.user.id,action:'view'});if(error)throw error}
 return{...wire,access:{...wire.access,followup:!!followup},followup};
}
