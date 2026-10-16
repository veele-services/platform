"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {unstable_rethrow} from "next/navigation";
import { getPlatformTeamActor } from "@/lib/platform/team";
import { supportInviteSchema, supportChangeSchema,primaryAdminSchema } from "@/lib/platform/team-model";
import { deliverSupportInvitation } from "@/lib/platform/team-invitation";
import { prepareManagementAccount, requireManagementMail } from "@/lib/management/invitations";
import { ticketRpc } from "@/lib/tickets/rpc";
import { message, type ActionResult } from "@/lib/actions/result";

function supportFailure(error:unknown){
 unstable_rethrow(error);
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 if(code==='40001')return 'Het supportteam is intussen gewijzigd. Vernieuw de gegevens en controleer je wijziging.';
 if(code==='42501')return 'Controleer je platformtoegang en log opnieuw in met een inlogcode om deze wijziging te doen.';
 return message(error);
}
export async function inviteSupportMember(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const { requestId, ...input } = supportInviteSchema.parse(raw), { db } = await getPlatformTeamActor();
    requireManagementMail();
    await ticketRpc(db, "platform_team_command", { command: "prepare_invite", input, request_id: randomUUID() });
    const userId = await prepareManagementAccount(input.email,input.name);
    const result = await ticketRpc(db, "platform_team_command", { command: "invite", input: { ...input, userId, version: 0 }, request_id: requestId });
    const delivery = await deliverSupportInvitation(db, result);
    revalidatePath("/platform/team");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: supportFailure(error) }; }
}
export async function changeSupportMember(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const { command, requestId, ...input } = supportChangeSchema.parse(raw), { db } = await getPlatformTeamActor();
    if (command === "resend") requireManagementMail();
    const result = await ticketRpc(db, "platform_team_command", { command, input, request_id: requestId });
    const delivery = command === "resend" ? await deliverSupportInvitation(db, result) : {};
    revalidatePath("/platform", "layout");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: supportFailure(error) }; }
}
export async function registerPrimaryAdministrator(raw:unknown):Promise<ActionResult>{
 try{const input=primaryAdminSchema.parse(raw),{db}=await getPlatformTeamActor();await ticketRpc(db,'platform_account_command',{target_user:input.userId,expected_revision:input.revision,request_id:input.requestId});revalidatePath('/platform','layout');return{ok:true}}catch(error){return{ok:false,error:supportFailure(error)}}
}
