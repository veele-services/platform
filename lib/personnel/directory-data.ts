import 'server-only';
import {getAuthContext} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {hasManagementPermission} from '@/lib/management/model';
import {getPlanningShellData} from '@/lib/planning/data';
import {personnelDirectoryColumns,personnelDirectoryRow} from '@/lib/data/personnel-directory';
import {canReadDossier} from './dossier';
/** The personnel directory needs five narrow collections, not every customer,
 * invoice, private file or unrelated operational record in the workspace. */
export async function getPersonnelDirectoryData(tenantId:string){
 const {tenant}=await getAuthContext();
 if(!tenant||tenant.id!==tenantId||!tenant.enabledServices.includes('personeel')||!hasManagementPermission(tenant,'backoffice.access')||!hasManagementPermission(tenant,'backoffice.personnel.read'))throw new Error('Geen toegang tot deze personeelslijst.');
 const db=await createClient();
 async function all<T>(fetch:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){const rows:T[]=[];for(let from=0;;from+=500){const r=await fetch(from,from+499);if(r.error)throw new Error('De personeelslijst kon niet volledig worden geladen.');rows.push(...r.data??[]);if((r.data?.length??0)<500)return rows}}
 const [shell,personnel,functions,qualifications,personnelFunctions,summary]=await Promise.all([
  getPlanningShellData(tenantId),
  all((from,to)=>db.from('personnel').select(personnelDirectoryColumns).eq('tenant_id',tenantId).order('full_name').order('id').range(from,to)),
  all((from,to)=>db.from('function_catalog').select('*').eq('tenant_id',tenantId).order('name').order('id').range(from,to)),
  all((from,to)=>db.from('qualifications').select('*').eq('tenant_id',tenantId).order('id').range(from,to)),
  all((from,to)=>db.from('personnel_functions').select('*').eq('tenant_id',tenantId).order('id').range(from,to)),
  canReadDossier(tenant.roles)&&hasManagementPermission(tenant,'backoffice.personnel.sensitive')&&hasManagementPermission(tenant,'backoffice.functions.personnel_dossier_summary')?db.rpc('personnel_dossier_summary',{target_tenant:tenantId}):Promise.resolve({data:[],error:null}),
 ]);
 if(summary.error)throw new Error('De dossiersamenvatting kon niet worden geladen.');
 return{...shell,personnel:personnel.map(personnelDirectoryRow),functions,qualifications,personnelFunctions,dossierSummary:summary.data??[]};
}
