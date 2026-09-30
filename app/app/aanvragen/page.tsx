import {notFound,redirect} from "next/navigation";
import {getAuthContext} from "@/lib/auth/context";
import {createClient} from "@/lib/supabase/server";
import {getPlanningShellData} from "@/lib/planning/data";
import {BackofficeShell} from "@/components/fieldgrid/backoffice-shell";
import {CommercialPage} from "@/components/fieldgrid/commercial/page";
import {filtersSchema,type CommercialList,type CommercialOptions} from "@/lib/commercial/model";
export default async function RequestsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const context=await getAuthContext();if(!context.tenant)redirect(context.isPlatformAdmin?"/platform":"/app");
 if(!context.tenant.enabledServices.includes("planning")||!context.tenant.roles.some(r=>["tenant_admin","management","planner","finance"].includes(r)))notFound();
 const raw=await searchParams;const query=Object.fromEntries(Object.entries(raw).filter(([,v])=>typeof v==="string"));const filters=filtersSchema.parse(query);
 const db=await createClient();const [list,options,shell]=await Promise.all([db.rpc("commercial_list",{target_tenant:context.tenant.id,filters}),db.rpc("commercial_options",{target_tenant:context.tenant.id,customer:filters.customer||undefined}),getPlanningShellData(context.tenant.id)]);
 return <BackofficeShell context={{...context,tenant:context.tenant}} data={shell} initialView="aanvragen"><CommercialPage tenant={context.tenant} userId={context.user.id} initial={list.error?null:list.data as unknown as CommercialList} options={options.data as unknown as CommercialOptions} /></BackofficeShell>;
}
