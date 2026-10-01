import "server-only";
import { z } from "zod";
import { getTicketActor } from "./auth";
import { ticketRpc } from "./rpc";
import { ticketQuerySchema, type TicketQuery, type TicketWorkspace } from "./model";
import { projectAccess, projectDetail, projectList, projectOptions, projectSettings } from "./projection";

/** No cross-request cache: membership/grant revocation applies to the next read. */
export async function queryTickets(workspace: TicketWorkspace, operation: string, payload: Record<string, unknown> = {}) {
  const actor = await getTicketActor(workspace);
  return ticketRpc(actor.db, "ticket_query", { target_tenant: actor.tenantId, actor_context: workspace, operation, payload });
}
export async function getTicketAccess(workspace: TicketWorkspace) {
  const actor = await getTicketActor(workspace);
  const raw = await ticketRpc(actor.db, "ticket_query", { target_tenant: actor.tenantId, actor_context: workspace, operation: "access", payload: {} });
  return projectAccess(raw, workspace, actor.user.id, actor.tenant);
}
export async function getTicketList(workspace: TicketWorkspace, input: TicketQuery) {
  const q = ticketQuerySchema.parse(input);
  const payload = { search: q.search, view: q.view, status: q.status, priority: q.priority, category_id: q.categoryId, assigned_user_id: q.assigneeId, tenant_id: q.tenantId, from: q.from, to: q.to, sort: q.sort, direction: q.direction, page: q.page, page_size: q.pageSize, context_kind: q.contextKind, context_id: q.contextId };
  return projectList(await queryTickets(workspace, "list", payload));
}
export async function getTicketDetail(workspace: TicketWorkspace, id: string) {
  return projectDetail(await queryTickets(workspace, "detail", { ticket_id: z.uuid().parse(id) }), workspace);
}
export async function getTicketOptions(workspace: TicketWorkspace) {
  const options = projectOptions(await queryTickets(workspace, "options"));
  options.technicalContext = { environment: process.env.DEPLOY_TARGET ?? "local", release: /^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? "") ? process.env.RELEASE_SHA! : "local" };
  return options;
}
export async function getTicketSettings(workspace: TicketWorkspace) {
  return projectSettings(await queryTickets(workspace, "config"));
}
