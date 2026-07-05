"use server";

import {
  auditLogTable,
  db,
  platformTicketNotesTable,
  platformTicketsTable,
  platformUsersTable,
  plansTable,
  supportAccessGrantsTable,
  tenantDomainsTable,
  tenantsTable,
  tenantSubscriptionsTable,
  type PlatformTicketPriority,
  type PlatformTicketStatus,
  type PlatformTicketType,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, type CurrentPlatformUser } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

export type PlatformTicketTenantOption = {
  id: string;
  name: string;
  slug: string;
};

export type PlatformTicketLinkOption = {
  id: string;
  tenantId: string | null;
  label: string;
  helper: string;
};

export type PlatformTicketUserOption = {
  id: string;
  role: string;
  userId: string;
};

export type PlatformTicketRow = {
  id: string;
  type: PlatformTicketType;
  status: PlatformTicketStatus;
  priority: PlatformTicketPriority;
  title: string;
  description: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  subscriptionId: string | null;
  subscriptionLabel: string | null;
  domainId: string | null;
  domainLabel: string | null;
  supportGrantId: string | null;
  supportGrantLabel: string | null;
  smokeRunId: string | null;
  auditLogId: string | null;
  auditLogLabel: string | null;
  assigneePlatformUserId: string | null;
  assigneeLabel: string | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  latestNoteAt: string | null;
  isOverdue: boolean;
};

export type PlatformTicketNoteRow = {
  id: string;
  ticketId: string;
  authorPlatformUserId: string | null;
  authorLabel: string;
  visibility: string;
  body: string;
  createdAt: string;
};

export type PlatformTicketDashboard = {
  generatedAt: string;
  stats: {
    total: number;
    open: number;
    inProgress: number;
    waiting: number;
    resolved: number;
    closed: number;
    highPriority: number;
    overdue: number;
  };
  tickets: PlatformTicketRow[];
  tenants: PlatformTicketTenantOption[];
  subscriptions: PlatformTicketLinkOption[];
  domains: PlatformTicketLinkOption[];
  supportGrants: PlatformTicketLinkOption[];
  auditEvents: PlatformTicketLinkOption[];
  platformUsers: PlatformTicketUserOption[];
};

export type PlatformTicketDetail = PlatformTicketRow & {
  notes: PlatformTicketNoteRow[];
  linkOptions: Pick<
    PlatformTicketDashboard,
    "tenants" | "subscriptions" | "domains" | "supportGrants" | "auditEvents" | "platformUsers"
  >;
};

const TICKET_TYPES: PlatformTicketType[] = ["support", "incident", "onboarding", "billing", "domain", "security"];
const TICKET_STATUSES: PlatformTicketStatus[] = [
  "open",
  "in_progress",
  "waiting_customer",
  "waiting_internal",
  "resolved",
  "closed",
];
const TICKET_PRIORITIES: PlatformTicketPriority[] = ["low", "normal", "high", "urgent"];
const OPEN_TICKET_STATUSES: PlatformTicketStatus[] = ["open", "in_progress", "waiting_customer", "waiting_internal"];

function actionValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function nullableValue(formData: FormData, name: string, maxLength = 500): string | null {
  const value = actionValue(formData, name);
  if (!value || value === "__none") return null;
  return value.slice(0, maxLength);
}

function nullableDateValue(formData: FormData, name: string): Date | null {
  const value = actionValue(formData, name);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTicketType(value: string): PlatformTicketType {
  return TICKET_TYPES.includes(value as PlatformTicketType) ? (value as PlatformTicketType) : "support";
}

function normalizeTicketStatus(value: string): PlatformTicketStatus {
  return TICKET_STATUSES.includes(value as PlatformTicketStatus) ? (value as PlatformTicketStatus) : "open";
}

function normalizeTicketPriority(value: string): PlatformTicketPriority {
  return TICKET_PRIORITIES.includes(value as PlatformTicketPriority) ? (value as PlatformTicketPriority) : "normal";
}

function dateString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function ticketIsOverdue(ticket: { slaDueAt: Date | null; status: PlatformTicketStatus }): boolean {
  return Boolean(ticket.slaDueAt && ticket.slaDueAt.getTime() < Date.now() && !["resolved", "closed"].includes(ticket.status));
}

function revalidateTicket(ticketId?: string | null): void {
  revalidatePath("/platform");
  revalidatePath("/platform/tickets");
  if (ticketId) revalidatePath(`/platform/tickets/${ticketId}`);
}

async function writePlatformTicketAudit(input: {
  actor: CurrentPlatformUser;
  tenantId: string | null;
  action: string;
  ticketId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    tenantId: input.tenantId,
    userId: input.actor.userId,
    action: input.action,
    resource: "platform_tickets",
    resourceId: input.ticketId,
    metadata: input.metadata ?? null,
  });
}

async function getNoteMeta(): Promise<Map<string, { count: number; latestAt: Date | null }>> {
  const rows = await db
    .select({
      ticketId: platformTicketNotesTable.ticketId,
      count: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${platformTicketNotesTable.createdAt})`,
    })
    .from(platformTicketNotesTable)
    .groupBy(platformTicketNotesTable.ticketId);

  return new Map(rows.map((row) => [row.ticketId, { count: Number(row.count ?? 0), latestAt: row.latestAt ?? null }]));
}

async function selectTicketRows(where?: SQL): Promise<PlatformTicketRow[]> {
  const noteMeta = await getNoteMeta();
  const rows = await db
    .select({
      id: platformTicketsTable.id,
      type: platformTicketsTable.type,
      status: platformTicketsTable.status,
      priority: platformTicketsTable.priority,
      title: platformTicketsTable.title,
      description: platformTicketsTable.description,
      tenantId: platformTicketsTable.tenantId,
      tenantName: tenantsTable.name,
      tenantSlug: tenantsTable.slug,
      subscriptionId: platformTicketsTable.subscriptionId,
      subscriptionStatus: tenantSubscriptionsTable.status,
      subscriptionPlanName: plansTable.name,
      domainId: platformTicketsTable.domainId,
      domain: tenantDomainsTable.domain,
      supportGrantId: platformTicketsTable.supportGrantId,
      supportGrantReason: supportAccessGrantsTable.reason,
      supportGrantExpiresAt: supportAccessGrantsTable.expiresAt,
      smokeRunId: platformTicketsTable.smokeRunId,
      auditLogId: platformTicketsTable.auditLogId,
      auditAction: auditLogTable.action,
      auditResource: auditLogTable.resource,
      auditCreatedAt: auditLogTable.createdAt,
      assigneePlatformUserId: platformTicketsTable.assigneePlatformUserId,
      assigneeRole: platformUsersTable.role,
      assigneeUserId: platformUsersTable.userId,
      slaDueAt: platformTicketsTable.slaDueAt,
      resolvedAt: platformTicketsTable.resolvedAt,
      closedAt: platformTicketsTable.closedAt,
      lastActivityAt: platformTicketsTable.lastActivityAt,
      createdAt: platformTicketsTable.createdAt,
      updatedAt: platformTicketsTable.updatedAt,
    })
    .from(platformTicketsTable)
    .leftJoin(tenantsTable, eq(platformTicketsTable.tenantId, tenantsTable.id))
    .leftJoin(tenantSubscriptionsTable, eq(platformTicketsTable.subscriptionId, tenantSubscriptionsTable.id))
    .leftJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
    .leftJoin(tenantDomainsTable, eq(platformTicketsTable.domainId, tenantDomainsTable.id))
    .leftJoin(supportAccessGrantsTable, eq(platformTicketsTable.supportGrantId, supportAccessGrantsTable.id))
    .leftJoin(auditLogTable, eq(platformTicketsTable.auditLogId, auditLogTable.id))
    .leftJoin(platformUsersTable, eq(platformTicketsTable.assigneePlatformUserId, platformUsersTable.id))
    .where(where)
    .orderBy(desc(platformTicketsTable.lastActivityAt), desc(platformTicketsTable.createdAt))
    .limit(250);

  return rows.map((row) => {
    const meta = noteMeta.get(row.id);
    const subscriptionLabel = row.subscriptionId
      ? `${row.subscriptionPlanName ?? "Subscription"} - ${row.subscriptionStatus ?? "onbekend"}`
      : null;
    const supportGrantLabel = row.supportGrantId
      ? `${row.supportGrantReason ?? "Support grant"}${row.supportGrantExpiresAt ? ` tot ${row.supportGrantExpiresAt.toISOString().slice(0, 10)}` : ""}`
      : null;
    const auditLogLabel = row.auditLogId
      ? `${row.auditAction ?? "audit"} ${row.auditResource ?? ""}`.trim() || row.auditLogId
      : null;
    const assigneeLabel = row.assigneePlatformUserId
      ? `${row.assigneeRole ?? "platform"} - ${row.assigneeUserId ?? row.assigneePlatformUserId}`
      : null;

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      description: row.description,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      subscriptionId: row.subscriptionId,
      subscriptionLabel,
      domainId: row.domainId,
      domainLabel: row.domain,
      supportGrantId: row.supportGrantId,
      supportGrantLabel,
      smokeRunId: row.smokeRunId,
      auditLogId: row.auditLogId,
      auditLogLabel,
      assigneePlatformUserId: row.assigneePlatformUserId,
      assigneeLabel,
      slaDueAt: dateString(row.slaDueAt),
      resolvedAt: dateString(row.resolvedAt),
      closedAt: dateString(row.closedAt),
      lastActivityAt: row.lastActivityAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      noteCount: meta?.count ?? 0,
      latestNoteAt: dateString(meta?.latestAt ?? null),
      isOverdue: ticketIsOverdue({ slaDueAt: row.slaDueAt, status: row.status }),
    };
  });
}

async function getLinkOptions(): Promise<PlatformTicketDetail["linkOptions"]> {
  const [tenants, subscriptions, domains, supportGrants, auditEvents, platformUsers] = await Promise.all([
    db
      .select({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable)
      .orderBy(asc(tenantsTable.name)),
    db
      .select({
        id: tenantSubscriptionsTable.id,
        tenantId: tenantSubscriptionsTable.tenantId,
        tenantName: tenantsTable.name,
        planName: plansTable.name,
        status: tenantSubscriptionsTable.status,
      })
      .from(tenantSubscriptionsTable)
      .innerJoin(tenantsTable, eq(tenantSubscriptionsTable.tenantId, tenantsTable.id))
      .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
      .orderBy(desc(tenantSubscriptionsTable.updatedAt))
      .limit(200),
    db
      .select({
        id: tenantDomainsTable.id,
        tenantId: tenantDomainsTable.tenantId,
        tenantName: tenantsTable.name,
        domain: tenantDomainsTable.domain,
        status: tenantDomainsTable.verificationStatus,
      })
      .from(tenantDomainsTable)
      .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
      .orderBy(asc(tenantDomainsTable.domain))
      .limit(250),
    db
      .select({
        id: supportAccessGrantsTable.id,
        tenantId: supportAccessGrantsTable.tenantId,
        tenantName: tenantsTable.name,
        reason: supportAccessGrantsTable.reason,
        expiresAt: supportAccessGrantsTable.expiresAt,
      })
      .from(supportAccessGrantsTable)
      .innerJoin(tenantsTable, eq(supportAccessGrantsTable.tenantId, tenantsTable.id))
      .orderBy(desc(supportAccessGrantsTable.createdAt))
      .limit(150),
    db
      .select({
        id: auditLogTable.id,
        tenantId: auditLogTable.tenantId,
        action: auditLogTable.action,
        resource: auditLogTable.resource,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(150),
    db
      .select({ id: platformUsersTable.id, role: platformUsersTable.role, userId: platformUsersTable.userId })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.status, "active"))
      .orderBy(asc(platformUsersTable.role), asc(platformUsersTable.createdAt)),
  ]);

  return {
    tenants,
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      tenantId: subscription.tenantId,
      label: `${subscription.tenantName} - ${subscription.planName}`,
      helper: subscription.status,
    })),
    domains: domains.map((domain) => ({
      id: domain.id,
      tenantId: domain.tenantId,
      label: domain.domain,
      helper: `${domain.tenantName} - ${domain.status}`,
    })),
    supportGrants: supportGrants.map((grant) => ({
      id: grant.id,
      tenantId: grant.tenantId,
      label: grant.reason,
      helper: `${grant.tenantName} - tot ${grant.expiresAt.toISOString().slice(0, 10)}`,
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      tenantId: event.tenantId,
      label: `${event.action} ${event.resource}`.trim(),
      helper: event.createdAt.toISOString().slice(0, 16).replace("T", " "),
    })),
    platformUsers: platformUsers.map((user) => ({
      id: user.id,
      role: user.role,
      userId: user.userId,
    })),
  };
}

function buildStats(tickets: PlatformTicketRow[]): PlatformTicketDashboard["stats"] {
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    waiting: tickets.filter((ticket) => ticket.status === "waiting_customer" || ticket.status === "waiting_internal").length,
    resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
    closed: tickets.filter((ticket) => ticket.status === "closed").length,
    highPriority: tickets.filter((ticket) => ticket.priority === "high" || ticket.priority === "urgent").length,
    overdue: tickets.filter((ticket) => ticket.isOverdue).length,
  };
}

async function getTicketForAction(ticketId: string): Promise<{ id: string; tenantId: string | null; status: PlatformTicketStatus } | null> {
  const [ticket] = await db
    .select({ id: platformTicketsTable.id, tenantId: platformTicketsTable.tenantId, status: platformTicketsTable.status })
    .from(platformTicketsTable)
    .where(eq(platformTicketsTable.id, ticketId))
    .limit(1);

  return ticket ?? null;
}

export async function listPlatformTickets(): Promise<PlatformTicketDashboard> {
  await requirePlatformAdmin();

  const [tickets, linkOptions] = await Promise.all([selectTicketRows(), getLinkOptions()]);

  return {
    generatedAt: new Date().toISOString(),
    stats: buildStats(tickets),
    tickets,
    ...linkOptions,
  };
}

export async function getPlatformTicketDetail(ticketId: string): Promise<PlatformTicketDetail | null> {
  await requirePlatformAdmin();

  const [ticket] = await selectTicketRows(eq(platformTicketsTable.id, ticketId));
  if (!ticket) return null;

  const [notes, linkOptions] = await Promise.all([
    db
      .select({
        id: platformTicketNotesTable.id,
        ticketId: platformTicketNotesTable.ticketId,
        authorPlatformUserId: platformTicketNotesTable.authorPlatformUserId,
        authorRole: platformUsersTable.role,
        authorUserId: platformUsersTable.userId,
        visibility: platformTicketNotesTable.visibility,
        body: platformTicketNotesTable.body,
        createdAt: platformTicketNotesTable.createdAt,
      })
      .from(platformTicketNotesTable)
      .leftJoin(platformUsersTable, eq(platformTicketNotesTable.authorPlatformUserId, platformUsersTable.id))
      .where(eq(platformTicketNotesTable.ticketId, ticketId))
      .orderBy(desc(platformTicketNotesTable.createdAt)),
    getLinkOptions(),
  ]);

  return {
    ...ticket,
    notes: notes.map((note) => ({
      id: note.id,
      ticketId: note.ticketId,
      authorPlatformUserId: note.authorPlatformUserId,
      authorLabel: note.authorUserId ? `${note.authorRole ?? "platform"} - ${note.authorUserId}` : "Platform",
      visibility: note.visibility,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
    linkOptions,
  };
}

export async function createPlatformTicket(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const title = actionValue(formData, "title").slice(0, 220);
  const description = nullableValue(formData, "description", 5000);

  if (title.length < 3) {
    return { success: false, message: "Tickettitel is verplicht." };
  }

  const type = normalizeTicketType(actionValue(formData, "type"));
  const status = normalizeTicketStatus(actionValue(formData, "status") || "open");
  const priority = normalizeTicketPriority(actionValue(formData, "priority"));
  const tenantId = nullableValue(formData, "tenantId", 80);
  const subscriptionId = nullableValue(formData, "subscriptionId", 80);
  const domainId = nullableValue(formData, "domainId", 80);
  const supportGrantId = nullableValue(formData, "supportGrantId", 80);
  const smokeRunId = nullableValue(formData, "smokeRunId", 160);
  const auditLogId = nullableValue(formData, "auditLogId", 80);
  const assigneePlatformUserId = nullableValue(formData, "assigneePlatformUserId", 80);
  const now = new Date();
  const resolvedAt = status === "resolved" || status === "closed" ? now : null;
  const closedAt = status === "closed" ? now : null;

  const [ticket] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(platformTicketsTable)
      .values({
        type,
        status,
        priority,
        title,
        description,
        tenantId,
        subscriptionId,
        domainId,
        supportGrantId,
        smokeRunId,
        auditLogId,
        assigneePlatformUserId,
        createdByPlatformUserId: actor.id,
        slaDueAt: nullableDateValue(formData, "slaDueAt"),
        resolvedAt,
        closedAt,
        lastActivityAt: now,
        metadata: { source: "platform_admin" },
      })
      .returning({ id: platformTicketsTable.id, tenantId: platformTicketsTable.tenantId });

    if (description) {
      await tx.insert(platformTicketNotesTable).values({
        ticketId: created.id,
        authorPlatformUserId: actor.id,
        visibility: "internal",
        body: description,
      });
    }

    return [created];
  });

  await writePlatformTicketAudit({
    actor,
    tenantId: ticket.tenantId,
    action: "platform_ticket_created",
    ticketId: ticket.id,
    metadata: { type, status, priority, tenantId, domainId, subscriptionId, supportGrantId, smokeRunId, auditLogId },
  });

  revalidateTicket(ticket.id);
  return { success: true };
}

export async function updatePlatformTicket(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const ticketId = actionValue(formData, "ticketId");
  if (!ticketId) return { success: false, message: "Ticket ontbreekt." };

  const ticket = await getTicketForAction(ticketId);
  if (!ticket) return { success: false, message: "Ticket niet gevonden." };

  const status = normalizeTicketStatus(actionValue(formData, "status"));
  const priority = normalizeTicketPriority(actionValue(formData, "priority"));
  const linkUpdates = {
    ...(formData.has("subscriptionId") ? { subscriptionId: nullableValue(formData, "subscriptionId", 80) } : {}),
    ...(formData.has("domainId") ? { domainId: nullableValue(formData, "domainId", 80) } : {}),
    ...(formData.has("supportGrantId") ? { supportGrantId: nullableValue(formData, "supportGrantId", 80) } : {}),
    ...(formData.has("auditLogId") ? { auditLogId: nullableValue(formData, "auditLogId", 80) } : {}),
    ...(formData.has("smokeRunId") ? { smokeRunId: nullableValue(formData, "smokeRunId", 160) } : {}),
  };
  const now = new Date();
  const resolvedAt = status === "resolved" || status === "closed" ? now : null;
  const closedAt = status === "closed" ? now : null;

  await db
    .update(platformTicketsTable)
    .set({
      status,
      priority,
      assigneePlatformUserId: nullableValue(formData, "assigneePlatformUserId", 80),
      slaDueAt: nullableDateValue(formData, "slaDueAt"),
      resolvedAt,
      closedAt,
      lastActivityAt: now,
      updatedAt: now,
      ...linkUpdates,
    })
    .where(eq(platformTicketsTable.id, ticketId));

  await writePlatformTicketAudit({
    actor,
    tenantId: ticket.tenantId,
    action: "platform_ticket_updated",
    ticketId,
    metadata: { status, priority, previousStatus: ticket.status, linkUpdates },
  });

  revalidateTicket(ticketId);
  return { success: true };
}

export async function addPlatformTicketNote(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const ticketId = actionValue(formData, "ticketId");
  const body = actionValue(formData, "body").slice(0, 5000);

  if (!ticketId) return { success: false, message: "Ticket ontbreekt." };
  if (body.length < 2) return { success: false, message: "Notitie is verplicht." };

  const ticket = await getTicketForAction(ticketId);
  if (!ticket) return { success: false, message: "Ticket niet gevonden." };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(platformTicketNotesTable).values({
      ticketId,
      authorPlatformUserId: actor.id,
      visibility: "internal",
      body,
    });

    await tx
      .update(platformTicketsTable)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(platformTicketsTable.id, ticketId));
  });

  await writePlatformTicketAudit({
    actor,
    tenantId: ticket.tenantId,
    action: "platform_ticket_note_added",
    ticketId,
    metadata: { visibility: "internal" },
  });

  revalidateTicket(ticketId);
  return { success: true };
}

export async function ensurePlatformTicketForDomainFailure(input: {
  tenantId: string;
  domainId: string;
  domain: string;
  failureCount: number;
  latestError: string | null;
}): Promise<string | null> {
  const existing = await db
    .select({ id: platformTicketsTable.id })
    .from(platformTicketsTable)
    .where(
      and(
        eq(platformTicketsTable.domainId, input.domainId),
        eq(platformTicketsTable.type, "domain"),
        inArray(platformTicketsTable.status, OPEN_TICKET_STATUSES),
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing[0]) {
    await db.transaction(async (tx) => {
      await tx.insert(platformTicketNotesTable).values({
        ticketId: existing[0].id,
        visibility: "internal",
        body: `Automatische domeincontrole faalde opnieuw (${input.failureCount} checks). ${input.latestError ?? "Geen detailmelding."}`,
      });
      await tx
        .update(platformTicketsTable)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(platformTicketsTable.id, existing[0].id));
    });
    return existing[0].id;
  }

  const [ticket] = await db
    .insert(platformTicketsTable)
    .values({
      type: "domain",
      status: "open",
      priority: input.failureCount >= 5 ? "high" : "normal",
      title: `Domeinverificatie blijft falen: ${input.domain}`,
      description: `DNS-verificatie voor ${input.domain} is ${input.failureCount} keer niet afgerond. ${input.latestError ?? "Geen detailmelding."}`,
      tenantId: input.tenantId,
      domainId: input.domainId,
      lastActivityAt: now,
      metadata: {
        source: "domain_verification",
        failureCount: input.failureCount,
        latestError: input.latestError,
      },
    })
    .returning({ id: platformTicketsTable.id });

  await db.insert(platformTicketNotesTable).values({
    ticketId: ticket.id,
    visibility: "internal",
    body: `Automatisch aangemaakt na ${input.failureCount} mislukte of onvolledige domeinchecks. ${input.latestError ?? "Controleer TXT en routing."}`,
  });

  revalidateTicket(ticket.id);
  return ticket.id;
}
