import 'server-only';
import {hasManagementPermission} from '@/lib/management/model';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {financeStateSchema,type FinanceQuery} from './finance';
export async function loadFinance(actor:Awaited<ReturnType<typeof cockpitActor>>,query:FinanceQuery){const data=financeStateSchema.parse(await ticketRpc(actor.db,'cockpit_finance_query',{target_tenant:actor.context.tenant.id,payload:query}));return{...data,canIndexation:actor.context.tenant.enabledServices.includes('planning')&&hasManagementPermission(actor.context.tenant,'backoffice.customers.read')&&hasManagementPermission(actor.context.tenant,'backoffice.functions.cockpit_indexation_query')}}
export async function getFinance(query:FinanceQuery){return loadFinance(await cockpitActor('backoffice.finance.read'),query)}
