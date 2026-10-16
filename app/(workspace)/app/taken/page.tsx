import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {getPlanningShellData} from '@/lib/planning/data';
import {reportRpc} from '@/lib/work-orders/report-rpc';
import {hasManagementPermission} from '@/lib/management/model';
import type {TaskCatalogueData} from '@/lib/tasks/model';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {SitesTasksList} from '@/components/fieldgrid/management-cockpit/tasks-list';
export default async function TasksPage(){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant||!tenant.enabledServices.includes('planning')||!tenant.roles.some(r=>['tenant_admin','management','planner','finance'].includes(r))||!hasManagementPermission(tenant,'backoffice.tasks.read')||!hasManagementPermission(tenant,'backoffice.functions.task_catalogue'))notFound();
 const[shell,data]=await Promise.all([getPlanningShellData(tenant.id),createClient().then(db=>reportRpc(db,'task_catalogue',{target_tenant:tenant.id}))]);
 return <BackofficeShell context={{...context,tenant}} initialView="taken" data={shell} presentation="sites-management"><SitesTasksList tenant={tenant} initial={data as TaskCatalogueData}/></BackofficeShell>;
}
