import 'server-only';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {createClient} from '@/lib/supabase/server';
import {operationalOrderRows,operationalTaskData} from '@/lib/work-orders/operational-data';
import type {TaskCatalogueWorkspace} from './model';
export async function getTaskCatalogueWorkspace(tenantId:string):Promise<TaskCatalogueWorkspace>{
 const {tenant}=await getAuthContext();if(!tenant||tenant.id!==tenantId||!tenant.enabledServices.includes('planning')||!hasManagementPermission(tenant,'backoffice.access')||!hasManagementPermission(tenant,'backoffice.tasks.read'))throw new Error('Geen toegang tot taakbeheer.');
 const db=await createClient(),canWork=hasManagementPermission(tenant,'backoffice.work_orders.read');
 async function all<T>(fetch:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){const rows:T[]=[];for(let from=0;;from+=500){const r=await fetch(from,from+499);if(r.error)throw new Error('De taakgegevens konden niet volledig worden geladen.');rows.push(...r.data??[]);if((r.data?.length??0)<500)return rows}}
 const[orders,revisions,tasks,rules]=await Promise.all([
  canWork&&hasManagementPermission(tenant,'backoffice.functions.work_order_operational_rows')?operationalOrderRows(db,tenantId,{all:true}):Promise.resolve({data:[],error:null}),
  canWork&&hasManagementPermission(tenant,'backoffice.functions.work_order_operational_task_data')?operationalTaskData(db,tenantId):Promise.resolve({taskRevisions:[],workOrderTasks:[]}),
  all((from,to)=>db.from('task_catalog').select('id,code,name').eq('tenant_id',tenantId).order('id').range(from,to)),
  all((from,to)=>db.from('extra_work_rules').select('id,task_revision_id').eq('tenant_id',tenantId).eq('active',true).order('id').range(from,to)),
 ]);
 return{workOrders:orders.data.map(w=>({id:w.id,status:w.status,work_order_number:w.work_order_number})),taskRevisions:revisions.taskRevisions.map(r=>({id:r.id,task_id:r.task_id,valid_until:r.valid_until})),tasks,extraWorkRules:rules};
}
