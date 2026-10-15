import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {slaStateSchema,type SlaQuery} from './service-levels';
export async function loadServiceLevels(actor:Awaited<ReturnType<typeof cockpitActor>>,query:SlaQuery){return slaStateSchema.parse(await ticketRpc(actor.db,'cockpit_sla_query',{target_tenant:actor.context.tenant.id,payload:query}))}
export async function getServiceLevels(query:SlaQuery){return loadServiceLevels(await cockpitActor(),query)}
