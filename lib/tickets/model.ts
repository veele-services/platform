import { z } from "zod";

export const ticketWorkspaces = ["staff", "tenant", "support", "platform", "customer"] as const;
export type TicketWorkspace = typeof ticketWorkspaces[number];
export const ticketWorkspaceSchema = z.enum(ticketWorkspaces);
export const ticketStatuses = ["new", "in_progress", "waiting_reporter", "waiting_external", "resolved", "closed", "cancelled"] as const;
export type TicketStatus = typeof ticketStatuses[number];
export const ticketPriorities = ["low", "normal", "high", "critical"] as const;
export type TicketPriority = typeof ticketPriorities[number];
export type TicketAudience = "reporter" | "tenant" | "platform";
export type TicketRoute = "internal" | "platform_support";
export const ticketStatusLabels: Record<TicketStatus, string> = { new: "Nieuw", in_progress: "In behandeling", waiting_reporter: "Wacht op melder", waiting_external: "Wacht op externe partij", resolved: "Opgelost", closed: "Gesloten", cancelled: "Geannuleerd" };
export const ticketPriorityLabels: Record<TicketPriority, string> = { low: "Laag", normal: "Normaal", high: "Hoog", critical: "Kritiek" };
export const ticketPaths: Record<TicketWorkspace, string> = { staff: "/staff/meldingen", tenant: "/app/meldingen", support: "/app/support", platform: "/platform/support", customer: "/klant?view=tickets" };
export const ticketWorkspaceLabels: Record<TicketWorkspace, string> = { staff: "Mijn meldingen", tenant: "Personeelsmeldingen", support: "Fieldgrid-support", platform: "Supportdesk", customer: "Klanttickets" };
export const ticketModules = ["planning", "werkbonnen", "personeel", "objecten", "klanten", "rapportage", "finance", "communicatie", "account", "overig"] as const;
const optionalId = z.preprocess(v => v === "" || v === null ? undefined : v, z.uuid().optional());
export const ticketQuerySchema = z.object({
  search: z.string().trim().max(160).default(""),
  view: z.enum(["all", "mine", "needs_reply", "unassigned", "overdue", "critical", "archived"]).default("all"),
  status: z.preprocess(v => v === "" ? undefined : v, z.enum(ticketStatuses).optional()),
  priority: z.preprocess(v => v === "" ? undefined : v, z.enum(ticketPriorities).optional()),
  categoryId: optionalId, assigneeId: optionalId, tenantId: optionalId,
  from: z.preprocess(v => v === "" ? undefined : v, z.iso.date().optional()),
  to: z.preprocess(v => v === "" ? undefined : v, z.iso.date().optional()),
  sort: z.enum(["attention", "activity", "created", "number", "subject", "priority", "status", "deadline"]).default("attention"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  contextKind: z.enum(["work_order", "object", "customer", "personnel"]).optional(), contextId: optionalId,
}).refine(q => !q.from || !q.to || q.from <= q.to, { message: "De einddatum mag niet vóór de begindatum liggen.", path: ["to"] })
  .refine(q => Boolean(q.contextKind) === Boolean(q.contextId), { message: "Kies een volledige werkcontext.", path: ["contextId"] });
export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type TicketPerson = { id: string; label: string };
export type TicketContextLink = { kind: "work_order" | "object" | "customer" | "personnel"; id: string; label: string; href?: string };
export type TicketCategory = { id: string; code: string; name: string; description: string; route: TicketRoute; confidential: boolean; active: boolean; canEscalate: boolean; order: number; groupLabel?: string; groupId?: string | null; defaultAssigneeId?: string | null; fallbackCategoryId?: string | null; responseMinutes: number; followupMinutes: number; autoCloseDays: number | null; pauseWhileWaiting: boolean; retentionProfile?: string | null; version: number; warning?: string | null };
export type TicketAccess = {
  workspace: TicketWorkspace; userId: string; allowed: boolean; canCreate: boolean; canConfigure: boolean;
  canDelegate: boolean; canAudit: boolean; capabilities: string[]; workspaces: TicketWorkspace[];
  tenant: { id: string; name: string; slug: string; timezone: string; primaryColor: string; accentColor: string; logoPath: string | null; whiteLabelEnabled: boolean } | null;
};
export type TicketRow = {
  id: string; number: string; subject: string; route: TicketRoute; tenantId: string;
  tenantName?: string; reporter?: TicketPerson; category: Pick<TicketCategory, "id" | "name" | "confidential">;
  status: TicketStatus; priority: TicketPriority; nextActor: string; nextStep: string;
  assignee: TicketPerson | null; assignedGroupName: string | null; context: TicketContextLink[]; module: string | null;
  timezone: string;
  createdAt: string; lastVisibleActivityAt: string; deadlineAt: string | null; neededBefore: string | null; unread: boolean; version: number;
  allowedActions: string[];
};
export type TicketFile = { id: string; name: string; mime: string; size: number; scanState: "pending" | "processing" | "clean" | "rejected" | "error"; downloadHref?: string; previewHref?: string; createdAt: string };
export type TicketMessage = { id: string; body: string; audience: TicketAudience; authorLabel: string; isOwn: boolean; createdAt: string; attachments: TicketFile[]; redacted?: boolean };
export type TicketEvent = { id: string; kind: string; label: string; audience: TicketAudience; actorLabel: string; createdAt: string; metadata?: Record<string, string | number | boolean | null> };
export type TicketDetail = TicketRow & {
  messages: TicketMessage[]; history: TicketEvent[]; allowedAudiences: TicketAudience[];
  assignees: TicketPerson[]; resolution: string | null; closedAt: string | null;
  linkedSupport?: { id: string; number: string; status: TicketStatus };
  sourceTicket?: { id: string; number: string }; shareOptions?: TicketFile[];
  responseDueAt: string | null; followupDueAt: string | null; autoCloseAt: string | null;
};
export type TicketListData = { items: TicketRow[]; total: number; page: number; pageSize: number; counts: { open: number; needsReply: number; unassigned: number; overdue: number }; categories: TicketCategory[]; assignees: TicketPerson[]; tenants: TicketPerson[] };
export type TicketOptions = { categories: TicketCategory[]; supportCategories: TicketCategory[]; contexts: TicketContextLink[]; modules: string[]; assignees: TicketPerson[]; technicalContext: { environment: string; release: string } };
export type TicketScope = { all: boolean; categories: string[]; personnelIds: string[]; objectIds: string[]; customerIds: string[]; tenantIds: string[]; assignedOnly: boolean };
export type TicketPermission = { key: string; label: string; description: string; domain: "tenant" | "platform"; module: string; sensitive: boolean; scopes: string[]; dependencies: string[]; delegable: boolean };
export type TicketGrant = { id: string; userId: string; userLabel: string; permission: string; scope: TicketScope; active: boolean; version: number };
export type TicketGroup = { id: string; name: string; memberIds: string[]; active: boolean; version: number };
export type TicketConfigAudit = { id: string; action: string; label: string; actorName: string; createdAt: string; targetId: string | null };
export type TicketSettings = { version: number; groups: TicketGroup[]; categories: TicketCategory[]; members: TicketPerson[]; permissions: TicketPermission[]; grants: TicketGrant[]; audit: TicketConfigAudit[]; scopeOptions: { personnel: TicketPerson[]; objects: TicketPerson[]; customers: TicketPerson[]; tenants: TicketPerson[] }; openingHours: { days: number[]; start: string; end: string }; timezone: string; enabled: boolean; canDelegate: boolean; canConfigure: boolean; preferences: { email: boolean; push: boolean }; warnings: string[] };
export type TicketResult<T = unknown> = { ok: true; id?: string; version?: number; data?: T } | { ok: false; error: string; code?: string };

export const ticketCommands = ["create", "reply", "status", "assign", "priority", "transfer", "share", "mark_read", "save_category", "save_group", "save_settings", "save_grant", "revoke_grant", "preferences", "archive", "redact"] as const;
export type TicketCommand = typeof ticketCommands[number];
export const ticketCommandSchema = z.enum(ticketCommands);
export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3, "Vul een onderwerp van minimaal drie tekens in.").max(180),
  categoryId: z.uuid(), body: z.string().trim().min(3, "Beschrijf je vraag of melding.").max(10000),
  urgency: z.enum(["normal", "urgent"]).default("normal"), neededBefore: z.iso.datetime({ offset: true }).nullable().optional(),
  workOrderId: optionalId, objectId: optionalId, module: z.enum(ticketModules).optional(),
  uploadIds: z.array(z.uuid()).max(5).default([]),
}).strict();
export const ticketReplySchema = z.object({ id: z.uuid(), version: z.number().int().positive(), body: z.string().trim().min(1, "Vul een bericht in.").max(10000), audience: z.enum(["reporter", "tenant", "platform"]), uploadIds: z.array(z.uuid()).max(5).default([]) }).strict();
export const ticketShareSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), subject: z.string().trim().min(3).max(180), body: z.string().trim().min(3).max(10000), categoryId: z.uuid(), module: z.enum(ticketModules), attachmentIds: z.array(z.uuid()).max(5).default([]) }).strict();

export function ticketQueryFromSearch(raw: Record<string, string | string[] | undefined>): TicketQuery {
  return ticketQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
}
export function ticketQueryString(query: Partial<TicketQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  return params.toString();
}
