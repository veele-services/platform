import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {financeStateSchema,type FinanceQuery} from './finance';
export async function loadFinance(actor:Awaited<ReturnType<typeof cockpitActor>>,query:FinanceQuery){return financeStateSchema.parse(await ticketRpc(actor.db,'cockpit_finance_query',{target_tenant:actor.context.tenant.id,payload:query}))}
export async function getFinance(query:FinanceQuery){return loadFinance(await cockpitActor('backoffice.finance.read'),query)}
