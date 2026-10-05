"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getObjectActor } from "@/lib/objects/auth";
import { customerTicketCommandSchema,customerTicketDetailSchema } from "./ticket-model";
const schema=z.object({accountId:z.uuid(),commandId:z.uuid(),action:customerTicketCommandSchema}).strict();
export async function saveCustomerTicket(input:unknown){
 try{
  const v=schema.parse(input),actor=await getObjectActor();
  const result=await actor.db.rpc("ticket_command",{target_tenant:actor.tenant.id,actor_context:"customer",command:v.action.command,payload:{account:v.accountId,...v.action.input},request_id:v.commandId});
  if(result.error)return {ok:false as const,error:result.error.code==="40001"?"Het ticket is gewijzigd. Controleer de actuele reacties en probeer opnieuw.":result.error.code==="54000"?"Je hebt veel acties uitgevoerd. Probeer het later opnieuw.":"Het ticket kon niet worden opgeslagen. Controleer je invoer en klanttoegang.",code:result.error.code};
  const detail=customerTicketDetailSchema.parse(result.data);
  revalidatePath("/klant","layout");revalidatePath("/app","layout");return {ok:true as const,detail};
 }catch{return {ok:false as const,error:"Je ticketactie kon niet worden bevestigd. Je invoer blijft staan; probeer opnieuw."};}
}
