import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerCommercialSchema } from "@/lib/customer-portal/commercial-model";
const headers={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 const q=new URL(request.url).searchParams,v=z.object({account:z.uuid(),request:z.uuid()}).strict().safeParse(Object.fromEntries(q));
 if(!v.success||q.getAll("account").length!==1||q.getAll("request").length!==1)return Response.json({error:"Ongeldige aanvraag."},{status:400,headers});
 try{
  const actor=await getObjectActor(),result=await actor.db.rpc("customer_portal_request_detail",{target_tenant:actor.tenant.id,target_account:v.data.account,target_request:v.data.request});
  if(result.error)return Response.json({error:"De aanvraag is niet beschikbaar."},{status:result.error.code==="42501"?403:503,headers});
  const detail=customerCommercialSchema.parse(result.data);if(detail.request.id!==v.data.request)throw new Error();
  return Response.json(detail,{headers});
 }catch{return Response.json({error:"De aanvraag kon niet worden gecontroleerd."},{status:503,headers});}
}
