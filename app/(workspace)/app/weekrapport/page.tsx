import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {ReportsView} from '@/components/fieldgrid/management-cockpit/reports';
import {reportQuerySchema} from '@/lib/management-cockpit/reports';
import {loadReports} from '@/lib/management-cockpit/reports-data';
export const metadata={title:'Managementweekrapport',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),h=await headers();if(!context.tenant||h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug||!context.tenant.roles.some(r=>['tenant_admin','management','planner','finance','hr'].includes(r)))notFound();
 const parsed=reportQuerySchema.safeParse(await searchParams);if(!parsed.success)notFound();const scoped={...context,tenant:context.tenant},db=await createClient();
 const[shell,initial]=await Promise.all([getPlanningShellData(context.tenant.id),loadReports({context:scoped,db},parsed.data)]).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='42501')notFound();throw error});
 return <BackofficeShell context={scoped} data={shell} initialView="weekrapport" presentation="sites-management"><ReportsView initial={initial}/></BackofficeShell>;
}
