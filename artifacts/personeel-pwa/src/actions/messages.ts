"use server";

import {
  assignmentInterestResponsesTable,
  assignmentPersonnelTable,
  assignmentsTable,
  db,
  personnelMessageEntriesTable,
  personnelMessageThreadsTable,
  personnelTable,
  type PersonnelTicketDepartment,
  type PersonnelTicketPriority,
  type PersonnelTicketStatus,
} from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/events";
import { createClient } from "@/lib/supabase/server";
import {
  TICKET_DEPARTMENT_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
} from "@/lib/ticket-options";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
type AssignmentQuestionResult = ActionResult & { ticketId?: string };

async function getCurrentPersonnel(): Promise<{
  id: string;
  userId: string;
  tenantId: string;
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
      tenantId: personnelTable.tenantId,
      userId: personnelTable.userId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!row?.userId) return null;

  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
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

function mapAssignmentPriority(value: string | null): PersonnelTicketPriority {
  if (value === "urgent" || value === "high" || value === "low") return value;
  return "normal";
}

function eventPriority(value: PersonnelTicketPriority): "low" | "normal" | "high" {
  if (value === "urgent" || value === "high") return "high";
  if (value === "low") return "low";
  return "normal";
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
        tenantId: personnel.tenantId,
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

export async function askQuestionAboutAssignment(
  assignmentId: string,
  body: string,
  source: "open_assignment" | "assigned_work_order" = "open_assignment",
): Promise<AssignmentQuestionResult> {
  const personnel = await getCurrentPersonnel();
  if (!personnel) return { success: false, error: "Niet ingelogd" };

  const question = String(body ?? "").trim().slice(0, 4000);
  if (question.length < 10) {
    return { success: false, error: "Vul een vraag van minimaal 10 tekens in." };
  }

  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      isActive: assignmentsTable.isActive,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.tenantId, personnel.tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, error: "Opdracht niet gevonden of niet beschikbaar." };
  }

  const [assignedLink] = await db
    .select({ id: assignmentPersonnelTable.id })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, assignment.id),
        eq(assignmentPersonnelTable.personnelId, personnel.id),
        inArray(assignmentPersonnelTable.status, ["assigned", "suggested"]),
      ),
    )
    .limit(1);

  const [interestResponse] = await db
    .select({
      id: assignmentInterestResponsesTable.id,
      status: assignmentInterestResponsesTable.status,
      expiresAt: assignmentInterestResponsesTable.expiresAt,
    })
    .from(assignmentInterestResponsesTable)
    .where(
      and(
        eq(assignmentInterestResponsesTable.assignmentId, assignment.id),
        eq(assignmentInterestResponsesTable.personnelId, personnel.id),
        eq(assignmentInterestResponsesTable.tenantId, personnel.tenantId),
      ),
    )
    .orderBy(desc(assignmentInterestResponsesTable.createdAt))
    .limit(1);

  const hasUsableInterestResponse = Boolean(
    interestResponse &&
    !["cancelled", "expired", "unavailable"].includes(interestResponse.status) &&
    (!interestResponse.expiresAt || interestResponse.expiresAt >= new Date()),
  );
  const usableInterestResponse =
    hasUsableInterestResponse && interestResponse ? interestResponse : null;

  if (!assignedLink && !hasUsableInterestResponse) {
    return {
      success: false,
      error: "U kunt alleen vragen stellen over uitnodigingen of eigen werkbonnen.",
    };
  }

  const priority = mapAssignmentPriority(assignment.priority);
  const subject = `Vraag over ${assignment.code || assignment.title}`;
  const preview = question.slice(0, 220);

  const ticketId = await db.transaction(async (tx) => {
    const [existingThread] = await tx
      .select({
        id: personnelMessageThreadsTable.id,
        department: personnelMessageThreadsTable.department,
      })
      .from(personnelMessageThreadsTable)
      .where(
        and(
          eq(personnelMessageThreadsTable.personnelId, personnel.id),
          eq(personnelMessageThreadsTable.assignmentId, assignment.id),
          ne(personnelMessageThreadsTable.status, "closed"),
        ),
      )
      .orderBy(desc(personnelMessageThreadsTable.lastMessageAt))
      .limit(1);

    const now = new Date();
    const threadId = existingThread?.id ?? (await tx
      .insert(personnelMessageThreadsTable)
      .values({
        tenantId: personnel.tenantId,
        personnelId: personnel.id,
        assignmentId: assignment.id,
        interestResponseId: usableInterestResponse?.id ?? null,
        subject,
        department: "planning",
        priority,
        status: "waiting_backoffice",
        lastMessagePreview: preview,
        lastMessageAt: now,
      })
      .returning({ id: personnelMessageThreadsTable.id }))[0]?.id;

    if (!threadId) {
      throw new Error("Ticket kon niet worden aangemaakt.");
    }

    await tx.insert(personnelMessageEntriesTable).values({
      threadId,
      authorType: "personnel",
      authorUserId: personnel.userId,
      authorName: personnel.name,
      department: existingThread?.department ?? "planning",
      body: question,
      readByPersonnelAt: now,
    });

    await tx
      .update(personnelMessageThreadsTable)
      .set({
        tenantId: personnel.tenantId,
        assignmentId: assignment.id,
        interestResponseId: usableInterestResponse?.id ?? null,
        status: "waiting_backoffice",
        closedAt: null,
        lastMessagePreview: preview,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(personnelMessageThreadsTable.id, threadId));

    if (
      usableInterestResponse &&
      ["invited", "viewed", "interested", "question"].includes(usableInterestResponse.status)
    ) {
      await tx
        .update(assignmentInterestResponsesTable)
        .set({
          status: "question",
          responseNote: question,
          respondedAt: now,
          updatedAt: now,
        })
        .where(eq(assignmentInterestResponsesTable.id, usableInterestResponse.id));
    }

    return threadId;
  });

  await emitDomainEvent({
    eventKey: "personnel_assignment_question_created",
    tenantId: personnel.tenantId,
    actorUserId: personnel.userId,
    audience: "management",
    aggregate: { type: "personnel_message_thread", id: ticketId },
    payload: {
      personnel: { id: personnel.id, name: personnel.name },
      assignment: {
        id: assignment.id,
        code: assignment.code,
        title: assignment.title,
        status: assignment.status,
        scheduledDate: assignment.scheduledDate,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
      },
      ticket: { id: ticketId, subject },
      href: `/tickets/personnel/${ticketId}`,
    },
    fallback: {
      title: `Vraag over ${assignment.code || "werkbon"}`,
      body: `${personnel.name} heeft een vraag gesteld over ${assignment.code || assignment.title}.`,
      category: "message",
      priority: eventPriority(priority),
      href: `/tickets/personnel/${ticketId}`,
      sourceLabel: "Personeelsapp",
    },
    audit: {
      action: "create_assignment_question_ticket",
      resource: "personnel_message_threads",
      resourceId: ticketId,
      metadata: {
        assignmentId: assignment.id,
        personnelId: personnel.id,
        interestResponseId: usableInterestResponse?.id ?? null,
        source,
      },
    },
  });

  revalidatePath("/berichten");
  revalidatePath(`/berichten/${ticketId}`);
  revalidatePath("/openstaand");
  revalidatePath(`/opdrachten/${assignment.id}`);

  return { success: true, ticketId };
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
