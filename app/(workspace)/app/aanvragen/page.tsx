import {notFound,redirect} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {getPlanningShellData} from '@/lib/planning/data';
import {hasManagementPermission} from '@/lib/management/model';
import {filtersSchema,type CommercialList,type CommercialOptions} from '@/lib/commercial/model';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {CommercialPage} from '@/components/fieldgrid/commercial/page';
export default async function RequestsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant)redirect(context.isPlatformAdmin?'/platform':'/app');
 if(!tenant.enabledServices.includes('planning')||!tenant.roles.some(r=>['tenant_admin','management','planner','finance'].includes(r))||!hasManagementPermission(tenant,'backoffice.commercial.read')||!hasManagementPermission(tenant,'backoffice.functions.commercial_list'))notFound();
 const query=await searchParams,filters=filtersSchema.parse(Object.fromEntries(Object.entries(query).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]))),db=await createClient();
 const[shell,list,options]=await Promise.all([getPlanningShellData(tenant.id),db.rpc('commercial_list',{target_tenant:tenant.id,filters}),hasManagementPermission(tenant,'backoffice.functions.commercial_options')?db.rpc('commercial_options',{target_tenant:tenant.id,query:filters.q,...(filters.customer?{customer:filters.customer}:{})}):Promise.resolve({data:null,error:null})]);
 if(list.error)throw new Error('De commerciële dossiers konden niet worden geladen.');
 return <BackofficeShell context={{...context,tenant}} data={shell} initialView="aanvragen" presentation="sites-management"><CommercialPage tenant={tenant} userId={context.user.id} initial={list.data as CommercialList} options={options.data as CommercialOptions|null}/></BackofficeShell>;
}
