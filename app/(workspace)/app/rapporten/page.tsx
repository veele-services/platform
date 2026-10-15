import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {getPlanningShellData} from '@/lib/planning/data';
import {getReportReviewList} from '@/lib/work-orders/report-review-data';
import {reportReviewQuery} from '@/lib/work-orders/source-presentation';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {SitesReportsList} from '@/components/fieldgrid/work-orders/source-reports-list';

export default async function ReportsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant||!tenant.enabledServices.includes('rapportage')||!tenant.roles.some(r=>['tenant_admin','management','planner','finance'].includes(r))||!['backoffice.reports.read','backoffice.work_orders.read','backoffice.functions.cockpit_report_review_list'].every(p=>hasManagementPermission(tenant,p)))notFound();
 const raw=await searchParams,parsed=reportReviewQuery.safeParse(Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Array.isArray(v)?v[0]:v])));if(!parsed.success)notFound();
 const [shell,data]=await Promise.all([getPlanningShellData(tenant.id),getReportReviewList(parsed.data)]);
 return <BackofficeShell context={{...context,tenant}} data={shell} initialView="controle" presentation="sites-management"><SitesReportsList initial={data} tenant={tenant} userId={context.user.id}/></BackofficeShell>;
}
