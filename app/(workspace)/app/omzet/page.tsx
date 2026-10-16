import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {FinanceView} from '@/components/fieldgrid/management-cockpit/finance';
import {financeQuerySchema} from '@/lib/management-cockpit/finance';
import {loadFinance} from '@/lib/management-cockpit/finance-data';
export const metadata={title:'Omzetbewaking',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),h=await headers();if(!context.tenant||h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug||!context.tenant.roles.some(r=>['tenant_admin','management','planner','finance','hr'].includes(r)))notFound();
 const parsed=financeQuerySchema.safeParse(await searchParams);if(!parsed.success)notFound();const scoped={...context,tenant:context.tenant},db=await createClient();
 const[shell,initial]=await Promise.all([getPlanningShellData(context.tenant.id),loadFinance({context:scoped,db},parsed.data)]).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='42501')notFound();throw error});
 return <BackofficeShell context={scoped} data={shell} initialView="omzet" presentation="sites-management"><FinanceView initial={initial}/></BackofficeShell>;
}
