import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerTicketDetailSchema,customerTicketOptionsSchema } from "@/lib/customer-portal/ticket-model";
const headers={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 const q=new URL(request.url).searchParams,v=z.object({account:z.uuid(),ticket:z.uuid().optional()}).strict().safeParse(Object.fromEntries(q));
 if(!v.success||q.getAll("account").length!==1||q.getAll("ticket").length>1)return Response.json({error:"Ongeldig klantticket."},{status:400,headers});
 try{
  const actor=await getObjectActor(),result=await actor.db.rpc("ticket_query",{target_tenant:actor.tenant.id,actor_context:"customer",operation:v.data.ticket?"detail":"options",payload:{account:v.data.account,...(v.data.ticket?{ticket_id:v.data.ticket}:{})}});
  if(result.error)return Response.json({error:"Dit ticket is niet beschikbaar."},{status:result.error.code==="42501"?403:503,headers});
  const data=v.data.ticket?customerTicketDetailSchema.parse(result.data):customerTicketOptionsSchema.parse(result.data);
  return Response.json(data,{headers});
 }catch{return Response.json({error:"Het klantticket kon niet worden gecontroleerd."},{status:503,headers});}
}
