"use server";

import {
  db,
  personnelMessageEntriesTable,
  personnelMessageThreadsTable,
  personnelTable,
  type PersonnelTicketDepartment,
  type PersonnelTicketPriority,
  type PersonnelTicketStatus,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const TICKET_DEPARTMENT_OPTIONS: Array<{
  value: PersonnelTicketDepartment;
  label: string;
}> = [
  { value: "planning", label: "Planning" },
  { value: "management", label: "Management" },
  { value: "backoffice", label: "Backoffice" },
  { value: "hr", label: "HR / Personeel" },
  { value: "finance", label: "Administratie" },
  { value: "it", label: "IT / App support" },
];

export const TICKET_PRIORITY_OPTIONS: Array<{
  value: PersonnelTicketPriority;
  label: string;
}> = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "urgent", label: "Urgent" },
];

export type PersonnelTicketListItem = {
  id: string;
  subject: string;
  department: PersonnelTicketDepartment;
  status: PersonnelTicketStatus;
  priority: PersonnelTicketPriority;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
};

export type PersonnelTicketMessage = {
  id: string;
  authorType: string;
  authorName: string;
  department: PersonnelTicketDepartment | null;
  body: string;
  readByPersonnelAt: string | null;
  createdAt: string;
};

export type PersonnelTicketDetail = PersonnelTicketListItem & {
  messages: PersonnelTicketMessage[];
};

export type TicketSummary = {
  unreadCount: number;
  openCount: number;
};

type ActionResult = { success: boolean; error?: string };

async function getCurrentPersonnel(): Promise<{
  id: string;
  userId: string;
  name: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({
      id: personnelTable.id,
      userId: personnelTable.userId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!row.userId) return null;

  return {
    id: row.id,
    userId: row.userId,
    name: `${row.firstName} ${row.lastName}`.trim(),
  };
}

function normalizeText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function isDepartment(value: string): value is PersonnelTicketDepartment {
  return TICKET_DEPARTMENT_OPTIONS.some((option) => option.value === value);
}

function isPriority(value: string): value is PersonnelTicketPriority {
  return TICKET_PRIORITY_OPTIONS.some((option) => option.value === value);
}

function mapThread(
  row: typeof personnelMessageThreadsTable.$inferSelect,
  unreadCount: number,
): PersonnelTicketListItem {
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
  row: typeof personnelMessageEntriesTable.$inferSelect,
): PersonnelTicketMessage {
  return {
    id: row.id,
    authorType: row.authorType,
    authorName: row.authorName,
    department: row.department,
    body: row.body,
    readByPersonnelAt: row.readByPersonnelAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getUnreadCounts(
  threadIds: string[],
): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map();

  const unreadRows = await db
    .select({
      threadId: personnelMessageEntriesTable.threadId,
    })
    .from(personnelMessageEntriesTable)
    .where(
      and(
        inArray(personnelMessageEntriesTable.threadId, threadIds),
        ne(personnelMessageEntriesTable.authorType, "personnel"),
        isNull(personnelMessageEntriesTable.readByPersonnelAt),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of unreadRows) {
    counts.set(row.threadId, (counts.get(row.threadId) ?? 0) + 1);
  }
  return counts;
}

export async function getMyTicketSummary(): Promise<TicketSummary> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return { unreadCount: 0, openCount: 0 };

  const threads = await db
    .select()
    .from(personnelMessageThreadsTable)
    .where(eq(personnelMessageThreadsTable.personnelId, personnel.id));

  const unreadCounts = await getUnreadCounts(threads.map((thread) => thread.id));
  const unreadCount = [...unreadCounts.values()].reduce(
    (total, value) => total + value,
    0,
  );

  return {
    unreadCount,
    openCount: threads.filter((thread) => thread.status !== "closed").length,
  };
}

export async function getMyTickets(): Promise<PersonnelTicketListItem[]> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return [];

  const threads = await db
    .select()
    .from(personnelMessageThreadsTable)
    .where(eq(personnelMessageThreadsTable.personnelId, personnel.id))
    .orderBy(desc(personnelMessageThreadsTable.lastMessageAt));

  const unreadCounts = await getUnreadCounts(threads.map((thread) => thread.id));
  return threads.map((thread) =>
    mapThread(thread, unreadCounts.get(thread.id) ?? 0),
  );
}

export async function getMyTicket(
  ticketId: string,
): Promise<PersonnelTicketDetail | null> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return null;

  const [thread] = await db
    .select()
    .from(personnelMessageThreadsTable)
    .where(
      and(
        eq(personnelMessageThreadsTable.id, ticketId),
        eq(personnelMessageThreadsTable.personnelId, personnel.id),
      ),
    )
    .limit(1);

  if (!thread) return null;

  const messages = await db
    .select()
    .from(personnelMessageEntriesTable)
    .where(eq(personnelMessageEntriesTable.threadId, thread.id))
    .orderBy(asc(personnelMessageEntriesTable.createdAt));

  await db
    .update(personnelMessageEntriesTable)
    .set({ readByPersonnelAt: new Date() })
    .where(
      and(
        eq(personnelMessageEntriesTable.threadId, thread.id),
        ne(personnelMessageEntriesTable.authorType, "personnel"),
        isNull(personnelMessageEntriesTable.readByPersonnelAt),
      ),
    );

  return {
    ...mapThread(thread, 0),
    messages: messages.map(mapMessage),
  };
}

export async function createMyTicket(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return { success: false, error: "Niet ingelogd" };

  const subject = normalizeText(formData.get("subject"), 180);
  const body = normalizeText(formData.get("body"), 4000);
  const departmentValue = String(formData.get("department") ?? "");
  const priorityValue = String(formData.get("priority") ?? "normal");
  const department = isDepartment(departmentValue)
    ? departmentValue
    : "backoffice";
  const priority = isPriority(priorityValue) ? priorityValue : "normal";

  if (subject.length < 4) {
    return { success: false, error: "Onderwerp is te kort" };
  }
  if (body.length < 10) {
    return { success: false, error: "Bericht is te kort" };
  }

  await db.transaction(async (tx) => {
    const [thread] = await tx
      .insert(personnelMessageThreadsTable)
      .values({
        personnelId: personnel.id,
        subject,
        department,
        priority,
        status: "waiting_backoffice",
        lastMessagePreview: body.slice(0, 220),
        lastMessageAt: new Date(),
      })
      .returning({ id: personnelMessageThreadsTable.id });

    await tx.insert(personnelMessageEntriesTable).values({
      threadId: thread.id,
      authorType: "personnel",
      authorUserId: personnel.userId,
      authorName: personnel.name,
      department,
      body,
      readByPersonnelAt: new Date(),
    });
  });

  revalidatePath("/berichten");
  return { success: true };
}

export async function replyToMyTicket(
  ticketId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return { success: false, error: "Niet ingelogd" };
  const body = normalizeText(formData.get("body"), 4000);
  if (body.length < 2) {
    return { success: false, error: "Bericht is te kort" };
  }

  const [thread] = await db
    .select()
    .from(personnelMessageThreadsTable)
    .where(
      and(
        eq(personnelMessageThreadsTable.id, ticketId),
        eq(personnelMessageThreadsTable.personnelId, personnel.id),
      ),
    )
    .limit(1);

  if (!thread) return { success: false, error: "Ticket niet gevonden" };

  await db.transaction(async (tx) => {
    await tx.insert(personnelMessageEntriesTable).values({
      threadId: thread.id,
      authorType: "personnel",
      authorUserId: personnel.userId,
      authorName: personnel.name,
      department: thread.department,
      body,
      readByPersonnelAt: new Date(),
    });

    await tx
      .update(personnelMessageThreadsTable)
      .set({
        status: "waiting_backoffice",
        closedAt: null,
        lastMessagePreview: body.slice(0, 220),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(personnelMessageThreadsTable.id, thread.id));
  });

  revalidatePath("/berichten");
  revalidatePath(`/berichten/${ticketId}`);
  return { success: true };
}

export async function closeMyTicket(ticketId: string): Promise<ActionResult> {
  return updateMyTicketStatus(ticketId, "closed");
}

export async function reopenMyTicket(ticketId: string): Promise<ActionResult> {
  return updateMyTicketStatus(ticketId, "waiting_backoffice");
}

async function updateMyTicketStatus(
  ticketId: string,
  status: PersonnelTicketStatus,
): Promise<ActionResult> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return { success: false, error: "Niet ingelogd" };

  const [updated] = await db
    .update(personnelMessageThreadsTable)
    .set({
      status,
      closedAt: status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(personnelMessageThreadsTable.id, ticketId),
        eq(personnelMessageThreadsTable.personnelId, personnel.id),
      ),
    )
    .returning({ id: personnelMessageThreadsTable.id });

  if (!updated) return { success: false, error: "Ticket niet gevonden" };

  revalidatePath("/berichten");
  revalidatePath(`/berichten/${ticketId}`);
  return { success: true };
}
