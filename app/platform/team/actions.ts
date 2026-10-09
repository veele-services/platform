"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPlatformTeamActor } from "@/lib/platform/team";
import { supportInviteSchema, supportChangeSchema } from "@/lib/platform/team-model";
import { deliverSupportInvitation } from "@/lib/platform/team-invitation";
import { prepareManagementAccount, requireManagementMail } from "@/lib/management/invitations";
import { ticketRpc } from "@/lib/tickets/rpc";
import { message, type ActionResult } from "@/lib/actions/result";

export async function inviteSupportMember(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const { requestId, ...input } = supportInviteSchema.parse(raw), { db } = await getPlatformTeamActor();
    requireManagementMail();
    await ticketRpc(db, "platform_team_command", { command: "prepare_invite", input, request_id: randomUUID() });
    const userId = await prepareManagementAccount(input.email);
    const result = await ticketRpc(db, "platform_team_command", { command: "invite", input: { ...input, userId, version: 0 }, request_id: requestId });
    const delivery = await deliverSupportInvitation(db, result);
    revalidatePath("/platform/team");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: message(error) }; }
}
export async function changeSupportMember(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const { command, requestId, ...input } = supportChangeSchema.parse(raw), { db } = await getPlatformTeamActor();
    if (command === "resend") requireManagementMail();
    const result = await ticketRpc(db, "platform_team_command", { command, input, request_id: requestId });
    const delivery = command === "resend" ? await deliverSupportInvitation(db, result) : {};
    revalidatePath("/platform", "layout");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: message(error) }; }
}
