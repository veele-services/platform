import { z } from "zod";
import { ticketStatuses, ticketPriorities, ticketPaths, type TicketAccess, type TicketAudience, type TicketCategory, type TicketContextLink, type TicketDetail, type TicketFile, type TicketGrant, type TicketListData, type TicketOptions, type TicketPermission, type TicketPerson, type TicketRow, type TicketScope, type TicketSettings, type TicketWorkspace } from "./model";

type Row = Record<string, unknown>;
export function record(value: unknown): Row { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
export function rows(value: unknown): Row[] { return Array.isArray(value) ? value.map(record) : []; }
const str = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const nullable = (value: unknown) => typeof value === "string" ? value : null;
const person = (value: unknown): TicketPerson => { const v = record(value); return { id: str(v.id ?? v.user_id), label: str(v.label ?? v.name ?? v.full_name, "Behandelaar") }; };

export function projectCategory(v: Row): TicketCategory {
  return { id: str(v.id), code: str(v.code), name: str(v.name), description: str(v.description), route: v.route === "platform_support" ? "platform_support" : "internal", confidential: v.confidential === true, active: v.active !== false, canEscalate: v.can_escalate === true, order: num(v.sort_order), groupLabel: str(v.group_name), groupId: nullable(v.group_id ?? v.default_group_id), defaultAssigneeId: nullable(v.default_assignee_id), fallbackCategoryId: nullable(v.fallback_category_id), responseMinutes: num(v.response_minutes), followupMinutes: num(v.followup_minutes), autoCloseDays: typeof v.auto_close_days === "number" ? v.auto_close_days : null, pauseWhileWaiting: v.pause_while_waiting === true, retentionProfile: nullable(v.retention_profile), version: num(v.revision, 1), warning: nullable(v.warning) };
}
export function projectContexts(input: unknown): TicketContextLink[] {
  return rows(input).flatMap(v => {
    if (!["work_order", "object", "customer", "personnel"].includes(str(v.kind)) || !z.uuid().safeParse(v.id).success) return [];
    const href = str(v.href);
    // Context labels are authorized by SQL. Only relative app navigation is accepted.
    return [{ kind: v.kind as TicketContextLink["kind"], id: str(v.id), label: str(v.label), ...(href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? { href } : {}) }];
  });
}
export function projectFile(v: Row, workspace: TicketWorkspace): TicketFile {
  const scanState = z.enum(["pending", "processing", "clean", "rejected", "error"]).parse(v.scanState ?? v.scan_status ?? v.scan_state);
  const id = z.uuid().parse(v.id);
  const href = `/api/tickets/files/${id}?workspace=${workspace}`;
  return { id, name: str(v.file_name ?? v.name), mime: str(v.mime_type ?? v.mime), size: num(v.size_bytes ?? v.size), scanState, createdAt: str(v.created_at ?? v.createdAt), ...(scanState === "clean" && v.released !== false ? { downloadHref: href, ...(str(v.mime_type ?? v.mime).startsWith("image/") ? { previewHref: `${href}&preview=1` } : {}) } : {}) };
}
export function projectTicket(v: Row): TicketRow {
  const p = record(v.permissions);
  const allowedActions = Object.entries(p).filter(([, yes]) => yes === true).map(([key]) => key);
  return { id: z.uuid().parse(v.id), number: str(v.number), subject: str(v.title), route: v.route === "platform_support" ? "platform_support" : "internal", tenantId: str(v.tenant_id), ...(typeof v.tenant_name === "string" ? { tenantName: v.tenant_name } : {}), ...(v.reporter ? { reporter: person(v.reporter) } : {}), category: { id: str(record(v.category).id), name: str(record(v.category).name), confidential: record(v.category).confidential === true }, status: z.enum(ticketStatuses).parse(v.status), priority: z.enum(ticketPriorities).parse(v.priority), nextActor: str(v.next_actor), nextStep: str(v.next_step), assignee: v.assigned_user ? person(v.assigned_user) : null, assignedGroupName: nullable(v.assigned_group_name), timezone: str(v.timezone, "Europe/Amsterdam"), context: projectContexts(v.context_links), module: nullable(v.module), createdAt: str(v.created_at), lastVisibleActivityAt: str(v.updated_at), deadlineAt: nullable(v.deadline_at ?? v.first_response_due_at ?? v.resolution_due_at), neededBefore: nullable(v.needed_before), unread: v.unread === true, version: num(v.revision, 1), allowedActions };
}
export function projectDetail(input: unknown, workspace: TicketWorkspace): TicketDetail | null {
  if (!input) return null;
  const v = record(input), base = projectTicket(v);
  const messages = rows(v.messages).map(m => ({ id: str(m.id), body: str(m.body), audience: z.enum(["reporter", "tenant", "platform"]).parse(m.audience), authorLabel: str(m.author_name), isOwn: m.is_own === true, createdAt: str(m.created_at), attachments: rows(m.attachments).map(f => projectFile(f, workspace)), redacted: m.redacted === true }));
  const audiences: TicketAudience[] = [];
  if (base.allowedActions.includes("reply")) audiences.push("reporter");
  if (base.allowedActions.includes("note") && workspace !== "staff") audiences.push(workspace === "platform" ? "platform" : "tenant");
  // Explicit projection: never forward unknown SQL columns, including source data.
  return { ...base, messages, history: rows(v.events).map(e => ({ id: str(e.id), kind: str(e.type), label: str(e.label), actorLabel: str(e.actor_name), audience: z.enum(["reporter", "tenant", "platform"]).parse(e.audience ?? "reporter"), createdAt: str(e.created_at) })), allowedAudiences: audiences, assignees: rows(v.handlers).map(person), resolution: nullable(v.resolution), closedAt: nullable(v.closed_at), responseDueAt: nullable(v.first_response_due_at), followupDueAt: nullable(v.resolution_due_at), autoCloseAt: nullable(v.auto_close_at), ...(workspace === "tenant" && v.linked_support ? { linkedSupport: { id: str(record(v.linked_support).id), number: str(record(v.linked_support).number), status: z.enum(ticketStatuses).parse(record(v.linked_support).status) } } : {}), ...(workspace === "support" && v.source_ticket ? { sourceTicket: { id: str(record(v.source_ticket).id), number: str(record(v.source_ticket).number) } } : {}), ...(workspace === "tenant" && base.allowedActions.includes("share") ? { shareOptions: rows(v.share_options).map(f => projectFile(f, workspace)) } : {}) };
}
export function projectList(input: unknown): TicketListData {
  const v = record(input), counts = record(v.counts);
  return { items: rows(v.items).map(projectTicket), total: num(v.total), page: num(v.page, 1), pageSize: num(v.page_size, 25), counts: { open: num(counts.open), needsReply: num(counts.needs_reply), unassigned: num(counts.unassigned), overdue: num(counts.overdue) }, categories: rows(v.categories).map(projectCategory), assignees: rows(v.handlers).map(person), tenants: rows(v.tenants).map(person) };
}
export function projectOptions(input: unknown): TicketOptions {
  const v = record(input);
  return { categories: rows(v.categories).map(projectCategory), supportCategories: rows(v.support_categories).map(projectCategory), contexts: projectContexts(v.contexts), modules: strings(v.modules), assignees: rows(v.handlers).map(person), technicalContext: { environment: "", release: "" } };
}
export function projectAccess(input: unknown, workspace: TicketWorkspace, userId: string, tenant: TicketAccess["tenant"]): TicketAccess {
  const v = record(input);
  return { workspace, userId, tenant, allowed: v.allowed === true, canCreate: v.can_create === true, canConfigure: v.can_configure === true, canDelegate: v.can_delegate === true, canAudit: v.can_audit === true, capabilities: strings(v.capabilities), workspaces: strings(v.workspaces).filter((s): s is TicketWorkspace => Object.hasOwn(ticketPaths, s)) };
}
export function projectScope(input: unknown): TicketScope {
  const v = record(input);
  return { all: v.all === true, categories: strings(v.category_ids), personnelIds: strings(v.personnel_ids), objectIds: strings(v.object_ids), customerIds: strings(v.customer_ids), tenantIds: strings(v.tenant_ids), assignedOnly: v.assigned_only === true };
}
export function scopePayload(scope: TicketScope) {
  return { all: scope.all, ...(scope.categories.length ? { category_ids: scope.categories } : {}), ...(scope.personnelIds.length ? { personnel_ids: scope.personnelIds } : {}), ...(scope.objectIds.length ? { object_ids: scope.objectIds } : {}), ...(scope.customerIds.length ? { customer_ids: scope.customerIds } : {}), ...(scope.tenantIds.length ? { tenant_ids: scope.tenantIds } : {}), ...(scope.assignedOnly ? { assigned_only: true } : {}) };
}
export function projectSettings(input: unknown): TicketSettings {
  const v = record(input), settings = record(v.settings), hours = record(settings.opening_hours), permission = record(v.permissions);
  const grants: TicketGrant[] = rows(v.grants).map(g => ({ id: str(g.id), userId: str(g.user_id), userLabel: str(g.user_name), permission: str(g.capability), scope: projectScope(g.scope), active: g.active !== false, version: num(g.revision, 1) }));
  const permissions: TicketPermission[] = rows(v.catalog).map(p => ({ key: str(p.key), label: str(p.label), description: str(p.description), domain: p.domain === "platform" ? "platform" : "tenant", module: str(p.module, "tickets"), sensitive: p.sensitive === true, scopes: strings(p.scopes), dependencies: strings(p.dependencies), delegable: p.delegable === true }));
  const scopes = record(v.scope_options);
  const audit = rows(v.audit).map(a => ({ id: str(a.id), action: str(a.action), label: str(a.label), actorName: str(a.actor_name), createdAt: str(a.created_at), targetId: typeof a.target_id === "string" ? a.target_id : null }));
  return { version: num(settings.revision, 1), groups: rows(v.groups).map(g => ({ id: str(g.id), name: str(g.name), memberIds: strings(g.member_ids), active: g.active !== false, version: num(g.revision, 1) })), categories: rows(v.categories).map(projectCategory), members: rows(v.members).map(person), permissions, grants, audit, scopeOptions: { personnel: rows(scopes.personnel).map(person), objects: rows(scopes.objects).map(person), customers: rows(scopes.customers).map(person), tenants: rows(scopes.tenants).map(person) }, openingHours: { days: Array.isArray(hours.days) ? hours.days.filter((d): d is number => typeof d === "number") : [1, 2, 3, 4, 5], start: str(hours.start, "09:00"), end: str(hours.end, "17:00") }, timezone: str(settings.timezone, "Europe/Amsterdam"), enabled: settings.enabled === true, canDelegate: permission.delegate === true, canConfigure: permission.configure === true, preferences: { email: record(v.preferences).email !== false, push: record(v.preferences).push === true }, warnings: strings(v.warnings) };
}
