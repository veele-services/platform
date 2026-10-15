"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getManagementActor } from "@/lib/management/auth";
import { managementRpc } from "@/lib/management/rpc";
import { managementInviteSchema, managementCommandSchema } from "@/lib/management/model";
import { deliverManagementInvitation, prepareManagementAccount, requireManagementMail } from "@/lib/management/invitations";
import { message, type ActionResult } from "@/lib/actions/result";
import type { Json } from "@/lib/database.types";

export async function inviteManagementUser(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const input = managementInviteSchema.parse(raw), actor = await getManagementActor("management.users.manage");
    requireManagementMail();
    // Fresh-owner guard happens before any service-role Auth account operation.
    await managementRpc(actor.db, "management_command", { target_tenant: actor.context.tenant.id, command: "prepare_invite", input: { name: input.name, email: input.email, roleId: input.roleId }, request_id: randomUUID() });
    const userId = await prepareManagementAccount(input.email);
    const result = await managementRpc(actor.db, "management_command", { target_tenant: actor.context.tenant.id, command: "invite", input: { name: input.name, email: input.email, roleId: input.roleId, userId }, request_id: input.requestId });
    const delivery = await deliverManagementInvitation(actor.context.tenant, result, actor.db);
    revalidatePath("/app/gebruikers");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: message(error) }; }
}
export async function runManagementCommand(raw: unknown): Promise<ActionResult<{ warning?: string }>> {
  try {
    const input = managementCommandSchema.parse(raw), actor = await getManagementActor(input.command === "accept_transfer" ? "backoffice.access" : "management.users.manage");
    const result = await managementRpc(actor.db, "management_command", { target_tenant: actor.context.tenant.id, command: input.command, input: input.input as Json, request_id: input.requestId });
    const delivery = input.command === "resend" ? await deliverManagementInvitation(actor.context.tenant, result, actor.db) : {};
    revalidatePath("/app", "layout");
    return { ok: true, ...delivery };
  } catch (error) { return { ok: false, error: message(error) }; }
}
