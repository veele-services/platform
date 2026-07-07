"use server";

import {
  customerMessageEntriesTable,
  customerMessageThreadsTable,
  db,
  type CustomerMessageAuthorType,
  type CustomerTicketDepartment,
  type CustomerTicketPriority,
  type CustomerTicketStatus,
} from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/events";
import { backofficeRoutes } from "@workspace/db/portal-routes";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getMyCustomerIdentity } from "./customer";

const CUSTOMER_TICKET_DEPARTMENT_OPTIONS: Array<{
  value: CustomerTicketDepartment;
  label: string;
}> = [
  { value: "planning", label: "Planning" },
  { value: "management", label: "Management" },
  { value: "backoffice", label: "Backoffice" },
  { value: "finance", label: "Financieel" },
  { value: "service", label: "Service" },
  { value: "support", label: "App support" },
];

const CUSTOMER_TICKET_PRIORITY_OPTIONS: Array<{
  value: CustomerTicketPriority;
  label: string;
}> = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "urgent", label: "Urgent" },
];

const CUSTOMER_VISIBLE_TENANT_AUTHOR = "Uw dienstverlener";

export type CustomerTicketListItem = {
  id: string;
  subject: string;
  department: CustomerTicketDepartment;
  status: CustomerTicketStatus;
  priority: CustomerTicketPriority;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
};

export type CustomerTicketMessage = {
  id: string;
  authorType: CustomerMessageAuthorType;
  authorName: string;
  department: CustomerTicketDepartment | null;
  body: string;
  readByCustomerAt: string | null;
  createdAt: string;
};

export type CustomerTicketDetail = CustomerTicketListItem & {
  messages: CustomerTicketMessage[];
};

export type CustomerTicketSummary = {
  unreadCount: number;
  openCount: number;
  recent: CustomerTicketListItem[];
};

type ActionResult = { success: boolean; error?: string };

function normalizeText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function isDepartment(value: string): value is CustomerTicketDepartment {
  return CUSTOMER_TICKET_DEPARTMENT_OPTIONS.some((option) => option.value === value);
}

function isPriority(value: string): value is CustomerTicketPriority {
  return CUSTOMER_TICKET_PRIORITY_OPTIONS.some((option) => option.value === value);
}

function mapThread(
  row: typeof customerMessageThreadsTable.$inferSelect,
  unreadCount: number,
): CustomerTicketListItem {
  return {
    id: row.id,
    subject: row.subject,
    department: row.department,
    status: row.status,
    priority: row.priority,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unreadCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapMessage(
  row: typeof customerMessageEntriesTable.$inferSelect,
): CustomerTicketMessage {
  const isCustomerAuthored = row.authorType === "customer";
  return {
    id: row.id,
    authorType: row.authorType,
    authorName: isCustomerAuthored ? row.authorName : CUSTOMER_VISIBLE_TENANT_AUTHOR,
    department: row.department,
    body: row.body,
    readByCustomerAt: row.readByCustomerAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function revalidateTicketSurfaces(ticketId?: string) {
  revalidatePath("/");
  revalidatePath("/meldingen");
  revalidatePath("/meldingen/tickets");
  if (ticketId) revalidatePath(`/meldingen/tickets/${ticketId}`);
}

async function getUnreadCounts(threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map();

  const unreadRows = await db
    .select({ threadId: customerMessageEntriesTable.threadId })
    .from(customerMessageEntriesTable)
    .where(
      and(
        inArray(customerMessageEntriesTable.threadId, threadIds),
        ne(customerMessageEntriesTable.authorType, "customer"),
        isNull(customerMessageEntriesTable.readByCustomerAt),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of unreadRows) {
    counts.set(row.threadId, (counts.get(row.threadId) ?? 0) + 1);
  }
  return counts;
}

export async function getMyCustomerTicketSummary(): Promise<CustomerTicketSummary> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { unreadCount: 0, openCount: 0, recent: [] };

  const threads = await db
    .select()
    .from(customerMessageThreadsTable)
    .where(
      and(
        eq(customerMessageThreadsTable.customerId, identity.customerId),
        eq(customerMessageThreadsTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(customerMessageThreadsTable.lastMessageAt))
    .limit(30);

  const unreadCounts = await getUnreadCounts(threads.map((thread) => thread.id));
  const mapped = threads.map((thread) =>
    mapThread(thread, unreadCounts.get(thread.id) ?? 0),
  );

  return {
    unreadCount: [...unreadCounts.values()].reduce((total, value) => total + value, 0),
    openCount: threads.filter((thread) => thread.status !== "closed").length,
    recent: mapped.slice(0, 3),
  };
}

export async function getMyCustomerTickets(): Promise<CustomerTicketListItem[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const threads = await db
    .select()
    .from(customerMessageThreadsTable)
    .where(
      and(
        eq(customerMessageThreadsTable.customerId, identity.customerId),
        eq(customerMessageThreadsTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(customerMessageThreadsTable.lastMessageAt));

  const unreadCounts = await getUnreadCounts(threads.map((thread) => thread.id));
  return threads.map((thread) =>
    mapThread(thread, unreadCounts.get(thread.id) ?? 0),
  );
}

export async function getMyCustomerTicket(
  ticketId: string,
): Promise<CustomerTicketDetail | null> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  const [thread] = await db
    .select()
    .from(customerMessageThreadsTable)
    .where(
      and(
        eq(customerMessageThreadsTable.id, ticketId),
        eq(customerMessageThreadsTable.customerId, identity.customerId),
        eq(customerMessageThreadsTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  if (!thread) return null;

  const messages = await db
    .select()
    .from(customerMessageEntriesTable)
    .where(eq(customerMessageEntriesTable.threadId, thread.id))
    .orderBy(asc(customerMessageEntriesTable.createdAt));

  await db
    .update(customerMessageEntriesTable)
    .set({ readByCustomerAt: new Date() })
    .where(
      and(
        eq(customerMessageEntriesTable.threadId, thread.id),
        ne(customerMessageEntriesTable.authorType, "customer"),
        isNull(customerMessageEntriesTable.readByCustomerAt),
      ),
    );

  return {
    ...mapThread(thread, 0),
    messages: messages.map(mapMessage),
  };
}

export async function createMyCustomerTicket(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  const subject = normalizeText(formData.get("subject"), 180);
  const body = normalizeText(formData.get("body"), 4000);
  const departmentValue = String(formData.get("department") ?? "");
  const priorityValue = String(formData.get("priority") ?? "normal");
  const department = isDepartment(departmentValue) ? departmentValue : "backoffice";
  const priority = isPriority(priorityValue) ? priorityValue : "normal";
  const authorName = identity.contactName ?? identity.customerName;

  if (subject.length < 4) return { success: false, error: "Onderwerp is te kort" };
  if (body.length < 10) return { success: false, error: "Bericht is te kort" };

  const [createdThread] = await db.transaction(async (tx) => {
    const [thread] = await tx
      .insert(customerMessageThreadsTable)
      .values({
        tenantId: identity.tenantId,
        customerId: identity.customerId,
        customerUserId: identity.customerUserId,
        subject,
        department,
        priority,
        status: "waiting_backoffice",
        lastMessagePreview: body.slice(0, 220),
        lastMessageAt: new Date(),
      })
      .returning({ id: customerMessageThreadsTable.id });

    await tx.insert(customerMessageEntriesTable).values({
      threadId: thread.id,
      authorType: "customer",
      authorUserId: identity.userId,
      authorName,
      department,
      body,
      readByCustomerAt: new Date(),
    });

    return [thread];
  });

  if (!createdThread) return { success: false, error: "Ticket aanmaken mislukt" };
  const backofficeHref = backofficeRoutes.customerTicket(createdThread.id);

  await emitDomainEvent({
    eventKey: "customer_ticket_created",
    tenantId: identity.tenantId,
    actorUserId: identity.userId,
    audience: "management",
    aggregate: { type: "customer_ticket", id: createdThread.id },
    payload: {
      customer: { id: identity.customerId, name: identity.customerName },
      ticket: { id: createdThread.id, subject, department, priority },
      backofficeHref,
    },
    fallback: {
      title: `Nieuw klantticket: ${subject}`,
      body: `${identity.customerName} heeft een nieuw ticket aangemaakt.`,
      category: "message",
      priority: priority === "urgent" ? "high" : "normal",
      href: backofficeHref,
      sourceLabel: "Klantportaal",
    },
    audit: false,
  });

  revalidateTicketSurfaces(createdThread.id);
  return { success: true };
}

export async function replyToMyCustomerTicket(
  ticketId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  const body = normalizeText(formData.get("body"), 4000);
  if (body.length < 2) return { success: false, error: "Bericht is te kort" };

  const [thread] = await db
    .select()
    .from(customerMessageThreadsTable)
    .where(
      and(
        eq(customerMessageThreadsTable.id, ticketId),
        eq(customerMessageThreadsTable.customerId, identity.customerId),
        eq(customerMessageThreadsTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  if (!thread) return { success: false, error: "Ticket niet gevonden" };
  const backofficeHref = backofficeRoutes.customerTicket(thread.id);

  const authorName = identity.contactName ?? identity.customerName;

  await db.transaction(async (tx) => {
    await tx.insert(customerMessageEntriesTable).values({
      threadId: thread.id,
      authorType: "customer",
      authorUserId: identity.userId,
      authorName,
      department: thread.department,
      body,
      readByCustomerAt: new Date(),
    });

    await tx
      .update(customerMessageThreadsTable)
      .set({
        status: "waiting_backoffice",
        closedAt: null,
        lastMessagePreview: body.slice(0, 220),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerMessageThreadsTable.id, thread.id));
  });

  await emitDomainEvent({
    eventKey: "customer_ticket_replied",
    tenantId: identity.tenantId,
    actorUserId: identity.userId,
    audience: "management",
    aggregate: { type: "customer_ticket", id: thread.id },
    payload: {
      customer: { id: identity.customerId, name: identity.customerName },
      ticket: { id: thread.id, subject: thread.subject, department: thread.department },
      backofficeHref,
    },
    fallback: {
      title: `Nieuwe klantreactie: ${thread.subject}`,
      body: `${identity.customerName} heeft gereageerd op een ticket.`,
      category: "message",
      href: backofficeHref,
      sourceLabel: "Klantportaal",
    },
    audit: false,
  });

  revalidateTicketSurfaces(ticketId);
  return { success: true };
}

export async function closeMyCustomerTicket(ticketId: string): Promise<ActionResult> {
  return updateMyCustomerTicketStatus(ticketId, "closed");
}

export async function reopenMyCustomerTicket(ticketId: string): Promise<ActionResult> {
  return updateMyCustomerTicketStatus(ticketId, "waiting_backoffice");
}

async function updateMyCustomerTicketStatus(
  ticketId: string,
  status: CustomerTicketStatus,
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  const [updated] = await db
    .update(customerMessageThreadsTable)
    .set({
      status,
      closedAt: status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customerMessageThreadsTable.id, ticketId),
        eq(customerMessageThreadsTable.customerId, identity.customerId),
        eq(customerMessageThreadsTable.tenantId, identity.tenantId),
      ),
    )
    .returning({ id: customerMessageThreadsTable.id });

  if (!updated) return { success: false, error: "Ticket niet gevonden" };

  revalidateTicketSurfaces(ticketId);
  return { success: true };
}
