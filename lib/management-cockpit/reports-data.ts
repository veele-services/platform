import 'server-only';
import {ticketRpc} from '@/lib/tickets/rpc';
import {cockpitActor} from './data';
import {reportsStateSchema,type ReportQuery} from './reports';
export async function loadReports(actor:Awaited<ReturnType<typeof cockpitActor>>,query:ReportQuery){return reportsStateSchema.parse(await ticketRpc(actor.db,'cockpit_reports_query',{target_tenant:actor.context.tenant.id,payload:query}))}
export async function getReports(query:ReportQuery){return loadReports(await cockpitActor('backoffice.reports.read'),query)}
