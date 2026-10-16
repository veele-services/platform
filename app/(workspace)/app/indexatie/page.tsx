import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {IndexationView} from '@/components/fieldgrid/management-cockpit/indexation';
import {indexationQuerySchema} from '@/lib/management-cockpit/indexation';
import {loadIndexation} from '@/lib/management-cockpit/indexation-data';
export const metadata={title:'Prijsindexatie',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),h=await headers();if(!context.tenant||h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug||!context.tenant.roles.some(r=>['tenant_admin','management','planner','finance','hr'].includes(r)))notFound();
 const parsed=indexationQuerySchema.safeParse(await searchParams);if(!parsed.success)notFound();const scoped={...context,tenant:context.tenant},db=await createClient();
 const[shell,initial]=await Promise.all([getPlanningShellData(context.tenant.id),loadIndexation({context:scoped,db},parsed.data)]).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='42501')notFound();throw error});
 return <BackofficeShell context={scoped} data={shell} initialView="indexatie" presentation="sites-management"><IndexationView initial={initial}/></BackofficeShell>;
}
