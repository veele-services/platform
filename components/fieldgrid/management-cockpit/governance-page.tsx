import 'server-only';
import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {governanceQuerySchema} from '@/lib/management-cockpit/governance';
import {loadGovernance} from '@/lib/management-cockpit/governance-data';
import {DecisionsView} from './decisions';
import {ComplianceView} from './compliance';
export async function GovernancePage({module,searchParams}:{module:'decisions'|'compliance';searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),h=await headers();
 if(!context.tenant||h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug||!context.tenant.roles.some(r=>['tenant_admin','management','planner','finance','hr'].includes(r)))notFound();
 const raw=await searchParams,query=governanceQuerySchema.safeParse({filter:module==='compliance'?'attention':'all',...Object.fromEntries(Object.entries(raw).filter(([key])=>['filter','search','page','pageSize','historyPage','record'].includes(key))),module});
 if(!query.success)notFound();
 const scoped={...context,tenant:context.tenant},db=await createClient(),[shell,initial]=await Promise.all([getPlanningShellData(context.tenant.id),loadGovernance({db,context:scoped},query.data)]);
 return <BackofficeShell context={scoped} data={shell} initialView={module==='decisions'?'besluiten':'compliance'} presentation="sites-management">{initial.module==='decisions'?<DecisionsView key={context.tenant.id+context.user.id} initial={initial}/>:<ComplianceView key={context.tenant.id+context.user.id} initial={initial}/>}</BackofficeShell>;
}
