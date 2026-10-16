import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {getTaskCatalogueWorkspace} from '@/lib/tasks/data';
import {getPlanningShellData} from '@/lib/planning/data';
import {hasManagementPermission} from '@/lib/management/model';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {TaskCatalogue} from '@/components/fieldgrid/tasks/catalogue';
export default async function TaskManagementPage({searchParams}:{searchParams:Promise<{tab?:string}>}){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant||!tenant.enabledServices.includes('planning')||!tenant.roles.some(r=>['tenant_admin','management','planner','finance'].includes(r))||!hasManagementPermission(tenant,'backoffice.tasks.read')||!hasManagementPermission(tenant,'backoffice.functions.task_catalogue'))notFound();
 const[data,shell,query]=await Promise.all([getTaskCatalogueWorkspace(tenant.id),getPlanningShellData(tenant.id),searchParams]);
 return <BackofficeShell context={{...context,tenant}} initialView="taken" data={shell} presentation="sites-management"><TaskCatalogue presentation="sites" tenant={tenant} workspace={data} initialTab={query.tab}/></BackofficeShell>;
}
