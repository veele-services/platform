"use server";

import {
  customerMessageEntriesTable,
  customerMessageThreadsTable,
  customersTable,
  db,
  personnelMessageEntriesTable,
  personnelMessageThreadsTable,
  personnelTable,
  type CustomerTicketPriority,
  type CustomerTicketStatus,
  type PersonnelTicketPriority,
  type PersonnelTicketStatus,
} from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/events";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type TicketKind = "customer" | "personnel";
export type BackofficeTicketStatus =
  | CustomerTicketStatus
  | PersonnelTicketStatus;
export type BackofficeTicketPriority =
  | CustomerTicketPriority
  | PersonnelTicketPriority;

export const TICKET_STATUS_OPTIONS: Array<{
  value: BackofficeTicketStatus;
  label: string;
}> = [
  { value: "open", label: "Open" },
  { value: "waiting_backoffice", label: "Bij Veele" },
  { value: "waiting_customer", label: "Wacht op klant" },
  { value: "waiting_personnel", label: "Wacht op medewerker" },
  { value: "closed", label: "Gesloten" },
];

export const TICKET_KIND_OPTIONS: Array<{ value: TicketKind | "all"; label: string }> = [
  { value: "all", label: "Alles" },
  { value: "customer", label: "Klanten" },
  { value: "personnel", label: "Personeel" },
];

export type BackofficeTicketListItem = {
  id: string;
  kind: TicketKind;
  subject: string;
  requesterName: string;
  requesterMeta: string | null;
  department: string;
  status: BackofficeTicketStatus;
  priority: BackofficeTicketPriority;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
};

export type BackofficeTicketMessage = {
  id: string;
  authorType: string;
  authorName: string;
  department: string | null;
  body: string;
  createdAt: string;
};

export type BackofficeTicketDetail = BackofficeTicketListItem & {
  tenantId: string | null;
  requesterId: string;
  messages: BackofficeTicketMessage[];
};

export type TicketListResult = {
  rows: BackofficeTicketListItem[];
  openCount: number;
  waitingBackofficeCount: number;
  unreadCount: number;
};

type ActionResult = { success: boolean; error?: string };

function normalizeText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function priorityForEvent(priority: BackofficeTicketPriority): "low" | "normal" | "high" {
  if (priority === "urgent" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

async function getBackofficeUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const metadata = user.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  return {
    id: user.id,
    email: user.email ?? null,
    name: metadata?.full_name ?? metadata?.name ?? user.email ?? "Veele Services",
  };
}

async function unreadCustomerCounts(threadIds: string[]) {
  if (threadIds.length === 0) return new Map<string, number>();

  const rows = await db
    .select({ threadId: customerMessageEntriesTable.threadId })
    .from(customerMessageEntriesTable)
    .where(
      and(
        inArray(customerMessageEntriesTable.threadId, threadIds),
        eq(customerMessageEntriesTable.authorType, "customer"),
        isNull(customerMessageEntriesTable.readByBackofficeAt),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.threadId, (counts.get(row.threadId) ?? 0) + 1);
  }
  return counts;
}

function revalidateTicketPaths(kind: TicketKind, id?: string) {
  revalidatePath("/tickets");
  if (id) revalidatePath(`/tickets/${kind}/${id}`);
}

export async function listTickets(params: {
  search?: string;
  status?: string;
  source?: string;
} = {}): Promise<TicketListResult> {
  await requirePermission("tickets", "read");

  const search = params.search?.trim();
  const status = params.status?.trim() ?? "all";
  const source = params.source === "customer" || params.source === "personnel"
    ? params.source
    : "all";

  const rows: BackofficeTicketListItem[] = [];

  if ((source === "all" || source === "customer") && status !== "waiting_personnel") {
    const conditions: SQL[] = [];
    if (status !== "all") {
      conditions.push(eq(customerMessageThreadsTable.status, status as CustomerTicketStatus));
    }
    if (search) {
      const term = `%${search}%`;
      const searchClause = or(
        ilike(customerMessageThreadsTable.subject, term),
        ilike(customerMessageThreadsTable.lastMessagePreview, term),
        ilike(customersTable.name, term),
        ilike(customersTable.code, term),
      );
      if (searchClause) conditions.push(searchClause);
    }

    const customerRows = await db
      .select({
        id: customerMessageThreadsTable.id,
        tenantId: customerMessageThreadsTable.tenantId,
        subject: customerMessageThreadsTable.subject,
        department: customerMessageThreadsTable.department,
        status: customerMessageThreadsTable.status,
        priority: customerMessageThreadsTable.priority,
        lastMessagePreview: customerMessageThreadsTable.lastMessagePreview,
        lastMessageAt: customerMessageThreadsTable.lastMessageAt,
        createdAt: customerMessageThreadsTable.createdAt,
        customerName: customersTable.name,
        customerCode: customersTable.code,
      })
      .from(customerMessageThreadsTable)
      .innerJoin(customersTable, eq(customerMessageThreadsTable.customerId, customersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(customerMessageThreadsTable.lastMessageAt))
      .limit(200);

    const unreadCounts = await unreadCustomerCounts(
      customerRows.map((row) => row.id),
    );

    rows.push(
      ...customerRows.map((row) => ({
        id: row.id,
        kind: "customer" as const,
        subject: row.subject,
        requesterName: row.customerName,
        requesterMeta: row.customerCode,
        department: row.department,
        status: row.status,
        priority: row.priority,
        lastMessagePreview: row.lastMessagePreview,
        lastMessageAt: row.lastMessageAt.toISOString(),
        unreadCount: unreadCounts.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  if ((source === "all" || source === "personnel") && status !== "waiting_customer") {
    const conditions: SQL[] = [];
    if (status !== "all") {
      conditions.push(eq(personnelMessageThreadsTable.status, status as PersonnelTicketStatus));
    }
    if (search) {
      const term = `%${search}%`;
      const searchClause = or(
        ilike(personnelMessageThreadsTable.subject, term),
        ilike(personnelMessageThreadsTable.lastMessagePreview, term),
        ilike(personnelTable.firstName, term),
        ilike(personnelTable.lastName, term),
        ilike(personnelTable.email, term),
      );
      if (searchClause) conditions.push(searchClause);
    }

    const personnelRows = await db
      .select({
        id: personnelMessageThreadsTable.id,
        subject: personnelMessageThreadsTable.subject,
        department: personnelMessageThreadsTable.department,
        status: personnelMessageThreadsTable.status,
        priority: personnelMessageThreadsTable.priority,
        lastMessagePreview: personnelMessageThreadsTable.lastMessagePreview,
        lastMessageAt: personnelMessageThreadsTable.lastMessageAt,
        createdAt: personnelMessageThreadsTable.createdAt,
        personnelFirstName: personnelTable.firstName,
        personnelLastName: personnelTable.lastName,
        personnelEmail: personnelTable.email,
      })
      .from(personnelMessageThreadsTable)
      .innerJoin(personnelTable, eq(personnelMessageThreadsTable.personnelId, personnelTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(personnelMessageThreadsTable.lastMessageAt))
      .limit(200);

    rows.push(
      ...personnelRows.map((row) => ({
        id: row.id,
        kind: "personnel" as const,
        subject: row.subject,
        requesterName: `${row.personnelFirstName} ${row.personnelLastName}`.trim(),
        requesterMeta: row.personnelEmail,
        department: row.department,
        status: row.status,
        priority: row.priority,
        lastMessagePreview: row.lastMessagePreview,
        lastMessageAt: row.lastMessageAt.toISOString(),
        unreadCount: row.status === "waiting_backoffice" ? 1 : 0,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  rows.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return {
    rows,
    openCount: rows.filter((row) => row.status !== "closed").length,
    waitingBackofficeCount: rows.filter((row) => row.status === "waiting_backoffice").length,
    unreadCount: rows.reduce((total, row) => total + row.unreadCount, 0),
  };
}

export async function getTicket(
  kind: TicketKind,
  id: string,
): Promise<BackofficeTicketDetail | null> {
  await requirePermission("tickets", "read");

  if (kind === "customer") {
    const [thread] = await db
      .select({
        id: customerMessageThreadsTable.id,
        tenantId: customerMessageThreadsTable.tenantId,
        customerId: customerMessageThreadsTable.customerId,
        subject: customerMessageThreadsTable.subject,
        department: customerMessageThreadsTable.department,
        status: customerMessageThreadsTable.status,
        priority: customerMessageThreadsTable.priority,
        lastMessagePreview: customerMessageThreadsTable.lastMessagePreview,
        lastMessageAt: customerMessageThreadsTable.lastMessageAt,
        createdAt: customerMessageThreadsTable.createdAt,
        customerName: customersTable.name,
        customerCode: customersTable.code,
      })
      .from(customerMessageThreadsTable)
      .innerJoin(customersTable, eq(customerMessageThreadsTable.customerId, customersTable.id))
      .where(eq(customerMessageThreadsTable.id, id))
      .limit(1);

    if (!thread) return null;

    const messages = await db
      .select()
      .from(customerMessageEntriesTable)
      .where(eq(customerMessageEntriesTable.threadId, id))
      .orderBy(asc(customerMessageEntriesTable.createdAt));

    await db
      .update(customerMessageEntriesTable)
      .set({ readByBackofficeAt: new Date() })
      .where(
        and(
          eq(customerMessageEntriesTable.threadId, id),
          eq(customerMessageEntriesTable.authorType, "customer"),
          isNull(customerMessageEntriesTable.readByBackofficeAt),
        ),
      );

    return {
      id: thread.id,
      kind,
      tenantId: thread.tenantId,
      requesterId: thread.customerId,
      requesterName: thread.customerName,
      requesterMeta: thread.customerCode,
      subject: thread.subject,
      department: thread.department,
      status: thread.status,
      priority: thread.priority,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      unreadCount: 0,
      createdAt: thread.createdAt.toISOString(),
      messages: messages.map((message) => ({
        id: message.id,
        authorType: message.authorType,
        authorName: message.authorName,
        department: message.department,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  const [thread] = await db
    .select({
      id: personnelMessageThreadsTable.id,
      personnelId: personnelMessageThreadsTable.personnelId,
      tenantId: personnelTable.tenantId,
      subject: personnelMessageThreadsTable.subject,
      department: personnelMessageThreadsTable.department,
      status: personnelMessageThreadsTable.status,
      priority: personnelMessageThreadsTable.priority,
      lastMessagePreview: personnelMessageThreadsTable.lastMessagePreview,
      lastMessageAt: personnelMessageThreadsTable.lastMessageAt,
      createdAt: personnelMessageThreadsTable.createdAt,
      personnelFirstName: personnelTable.firstName,
      personnelLastName: personnelTable.lastName,
      personnelEmail: personnelTable.email,
    })
    .from(personnelMessageThreadsTable)
    .innerJoin(personnelTable, eq(personnelMessageThreadsTable.personnelId, personnelTable.id))
    .where(eq(personnelMessageThreadsTable.id, id))
    .limit(1);

  if (!thread) return null;

  const messages = await db
    .select()
    .from(personnelMessageEntriesTable)
    .where(eq(personnelMessageEntriesTable.threadId, id))
    .orderBy(asc(personnelMessageEntriesTable.createdAt));

  return {
    id: thread.id,
    kind,
    tenantId: thread.tenantId,
    requesterId: thread.personnelId,
    requesterName: `${thread.personnelFirstName} ${thread.personnelLastName}`.trim(),
    requesterMeta: thread.personnelEmail,
    subject: thread.subject,
    department: thread.department,
    status: thread.status,
    priority: thread.priority,
    lastMessagePreview: thread.lastMessagePreview,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    unreadCount: thread.status === "waiting_backoffice" ? 1 : 0,
    createdAt: thread.createdAt.toISOString(),
    messages: messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      authorName: message.authorName,
      department: message.department,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function replyToTicket(
  kind: TicketKind,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("tickets", "write");
  const user = await getBackofficeUser();
  if (!user) return { success: false, error: "Niet geauthenticeerd." };

  const body = normalizeText(formData.get("body"), 4000);
  if (body.length < 2) return { success: false, error: "Reactie is te kort." };

  if (kind === "customer") {
    const [thread] = await db
      .select({
        id: customerMessageThreadsTable.id,
        tenantId: customerMessageThreadsTable.tenantId,
        customerId: customerMessageThreadsTable.customerId,
        subject: customerMessageThreadsTable.subject,
        department: customerMessageThreadsTable.department,
        priority: customerMessageThreadsTable.priority,
        customerName: customersTable.name,
      })
      .from(customerMessageThreadsTable)
      .innerJoin(customersTable, eq(customerMessageThreadsTable.customerId, customersTable.id))
      .where(eq(customerMessageThreadsTable.id, id))
      .limit(1);

    if (!thread) return { success: false, error: "Ticket niet gevonden." };

    await db.transaction(async (tx) => {
      await tx.insert(customerMessageEntriesTable).values({
        threadId: id,
        authorType: "backoffice",
        authorUserId: user.id,
        authorName: user.name,
        department: thread.department,
        body,
        readByBackofficeAt: new Date(),
      });

      await tx
        .update(customerMessageThreadsTable)
        .set({
          status: "waiting_customer",
          closedAt: null,
          lastMessagePreview: body.slice(0, 220),
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customerMessageThreadsTable.id, id));
    });

    await emitDomainEvent({
      eventKey: "customer_ticket_backoffice_reply",
      tenantId: thread.tenantId,
      actorUserId: user.id,
      audience: "customer",
      aggregate: { type: "customer_ticket", id },
      recipients: { customerIds: [thread.customerId] },
      payload: {
        customer: { id: thread.customerId, name: thread.customerName },
        ticket: { id, subject: thread.subject, department: thread.department },
        href: `/meldingen/tickets/${id}`,
      },
      fallback: {
        title: `Reactie op ticket: ${thread.subject}`,
        body: "Veele Services heeft gereageerd op uw ticket.",
        category: "message",
        priority: priorityForEvent(thread.priority),
        href: `/meldingen/tickets/${id}`,
        sourceLabel: "Veele Services",
      },
      audit: {
        action: "reply",
        resource: "customer_message_threads",
        resourceId: id,
        metadata: { ticketKind: kind },
      },
    });

    revalidateTicketPaths(kind, id);
    return { success: true };
  }

  const [thread] = await db
    .select({
      id: personnelMessageThreadsTable.id,
      personnelId: personnelMessageThreadsTable.personnelId,
      tenantId: personnelTable.tenantId,
      subject: personnelMessageThreadsTable.subject,
      department: personnelMessageThreadsTable.department,
      priority: personnelMessageThreadsTable.priority,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelMessageThreadsTable)
    .innerJoin(personnelTable, eq(personnelMessageThreadsTable.personnelId, personnelTable.id))
    .where(eq(personnelMessageThreadsTable.id, id))
    .limit(1);

  if (!thread) return { success: false, error: "Ticket niet gevonden." };

  await db.transaction(async (tx) => {
    await tx.insert(personnelMessageEntriesTable).values({
      threadId: id,
      authorType: "backoffice",
      authorUserId: user.id,
      authorName: user.name,
      department: thread.department,
      body,
      readByPersonnelAt: null,
    });

    await tx
      .update(personnelMessageThreadsTable)
      .set({
        status: "waiting_personnel",
        closedAt: null,
        lastMessagePreview: body.slice(0, 220),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(personnelMessageThreadsTable.id, id));
  });

  await emitDomainEvent({
    eventKey: "personnel_ticket_backoffice_reply",
    tenantId: thread.tenantId,
    actorUserId: user.id,
    audience: "personnel",
    aggregate: { type: "personnel_ticket", id },
    recipients: { personnelIds: [thread.personnelId] },
    payload: {
      personnel: {
        id: thread.personnelId,
        name: `${thread.firstName} ${thread.lastName}`.trim(),
      },
      ticket: { id, subject: thread.subject, department: thread.department },
      href: `/berichten/${id}`,
    },
    fallback: {
      title: `Reactie op ticket: ${thread.subject}`,
      body: "Veele Services heeft gereageerd op je ticket.",
      category: "message",
      priority: priorityForEvent(thread.priority),
      href: `/berichten/${id}`,
      sourceLabel: "Veele Services",
    },
    audit: {
      action: "reply",
      resource: "personnel_message_threads",
      resourceId: id,
      metadata: { ticketKind: kind },
    },
  });

  revalidateTicketPaths(kind, id);
  return { success: true };
}

export async function updateTicketStatus(
  kind: TicketKind,
  id: string,
  status: BackofficeTicketStatus,
): Promise<ActionResult> {
  await requirePermission("tickets", "write");

  if (kind === "customer") {
    const allowed = new Set<CustomerTicketStatus>([
      "open",
      "waiting_backoffice",
      "waiting_customer",
      "closed",
    ]);
    if (!allowed.has(status as CustomerTicketStatus)) {
      return { success: false, error: "Status niet geldig voor klanttickets." };
    }

    const [updated] = await db
      .update(customerMessageThreadsTable)
      .set({
        status: status as CustomerTicketStatus,
        closedAt: status === "closed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(customerMessageThreadsTable.id, id))
      .returning({ id: customerMessageThreadsTable.id });

    if (!updated) return { success: false, error: "Ticket niet gevonden." };
    revalidateTicketPaths(kind, id);
    return { success: true };
  }

  const allowed = new Set<PersonnelTicketStatus>([
    "open",
    "waiting_backoffice",
    "waiting_personnel",
    "closed",
  ]);
  if (!allowed.has(status as PersonnelTicketStatus)) {
    return { success: false, error: "Status niet geldig voor personeelstickets." };
  }

  const [updated] = await db
    .update(personnelMessageThreadsTable)
    .set({
      status: status as PersonnelTicketStatus,
      closedAt: status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(personnelMessageThreadsTable.id, id))
    .returning({ id: personnelMessageThreadsTable.id });

  if (!updated) return { success: false, error: "Ticket niet gevonden." };
  revalidateTicketPaths(kind, id);
  return { success: true };
}
