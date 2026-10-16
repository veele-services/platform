import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {overviewState,type OverviewQuery} from './overview';
export async function loadOverview(actor:Awaited<ReturnType<typeof cockpitActor>>,query:OverviewQuery){return overviewState(await ticketRpc(actor.db,'cockpit_overview_query',{target_tenant:actor.context.tenant.id,payload:query}),{id:actor.context.user.id,tenantName:actor.context.tenant.name,roleName:actor.context.tenant.managementRole||'Management'})}
export async function getOverview(query:OverviewQuery){return loadOverview(await cockpitActor('backoffice.overview.read'),query)}
