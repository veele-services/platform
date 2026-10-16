import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { authorizedFileResponse,privateFileHeaders,type PrivateFile } from "@/lib/files/private-download";
import { customerVisitDetailSchema } from "@/lib/customer-portal/visit-model";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.uuid().parse((await params).id),url=new URL(request.url),account=z.uuid().parse(url.searchParams.get("account")),order=z.uuid().parse(url.searchParams.get("order"));
  if(url.searchParams.getAll("account").length!==1||url.searchParams.getAll("order").length!==1)throw new Error();
  const actor=await getObjectActor();
  return await authorizedFileResponse(async()=>{
   const result=await actor.db.rpc("customer_portal_visit",{target_tenant:actor.tenant.id,target_account:account,target_visit:order});
   if(result.error)throw new Error();const detail=customerVisitDetailSchema.parse(result.data);
   if(!detail.requests.some(request=>request.documents.some(document=>document.id===id)))throw new Error();
   const file=await actor.db.rpc("get_object_document",{target_tenant:actor.tenant.id,target_document:id,target_order:order});
   if(file.error||!file.data)throw new Error();const record=file.data as Omit<PrivateFile,"bucket">;
   if(record.scope?.[0]!==actor.tenant.id||record.scope?.[1]!==detail.visit.objectId)throw new Error();
   return {...record,bucket:"object-documents"};
  },"inline");
 }catch{return new Response("Document niet beschikbaar",{status:404,headers:privateFileHeaders});}
}
