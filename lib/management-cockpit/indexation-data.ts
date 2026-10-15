import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {indexationStateSchema,type IndexationQuery} from './indexation';
export async function loadIndexation(actor:Awaited<ReturnType<typeof cockpitActor>>,query:IndexationQuery){return indexationStateSchema.parse(await ticketRpc(actor.db,'cockpit_indexation_query',{target_tenant:actor.context.tenant.id,payload:query}))}
export async function getIndexation(query:IndexationQuery){return loadIndexation(await cockpitActor('backoffice.finance.read'),query)}
