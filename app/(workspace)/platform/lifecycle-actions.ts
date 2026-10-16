"use server";
import {unstable_rethrow} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {getPlatformTeamActor} from '@/lib/platform/team';
import {tenantLifecycleSchema,tenantLifecycleResultSchema} from '@/lib/platform/tenant-lifecycle';
import {message,type ActionResult} from '@/lib/actions/result';
export async function changePlatformTenantStatus(raw:unknown):Promise<ActionResult>{
 try{
  const input=tenantLifecycleSchema.parse(raw),{db}=await getPlatformTeamActor();
  const {data,error}=await db.rpc('platform_tenant_lifecycle' as never,{target_tenant:input.tenantId,desired_status:input.status,expected_version:input.version,request_id:input.requestId} as never);
  if(error)throw new Error(error.message);
  tenantLifecycleResultSchema.parse(data);
  revalidatePath('/platform','layout');return{ok:true};
 }catch(error){unstable_rethrow(error);return{ok:false,error:message(error)}}
}
