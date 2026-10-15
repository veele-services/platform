import 'server-only';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {ticketRpc} from '@/lib/tickets/rpc';
import type {ReportReviewList,ReportReviewQuery} from './source-presentation';

export async function getReportReviewList(filters:ReportReviewQuery):Promise<ReportReviewList>{
 const {context,db}=await cockpitActor('backoffice.reports.read');
 // The authenticated RPC independently rechecks the live session, tenant,
 // report module and native work-order read boundary; no admin client.
 return await ticketRpc(db,'cockpit_report_review_list',{target_tenant:context.tenant.id,filters}) as ReportReviewList;
}
