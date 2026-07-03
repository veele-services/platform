"use server";

import {
  assignmentPersonnelTable,
  assignmentsTable,
  assignmentTasksTable,
  customersTable,
  db,
  objectsTable,
} from "@workspace/db";
import { emitAssignmentWorkflowEvent } from "@workspace/db/workflow-events";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { revalidatePath } from "next/cache";

export type MyAssignment = {
  id:               string;
  code:             string;
  title:            string;
  scheduledDate:    string | null;
  scheduledStart:   string | null;
  scheduledEnd:     string | null;
  seenAt:           string | null;
  actualStartedAt:  string | null;
  actualCompletedAt: string | null;
  completionReason: string | null;
  completionNotes:  string | null;
  customerSignatureRequired: boolean;
  customerSignatureDataUrl: string | null;
  status:           string;
  customerName:     string | null;
  contactName:      string | null;
  phone:            string | null;
  objectName:       string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  objectPostalCode: string | null;
  requiredRegion:   string | null;
};

export type MyAssignmentDetail = MyAssignment & {
  description: string | null;
  tasks: {
    id: string;
    sortOrder: number;
    notes: string | null;
    completedAt: string | null;
    completedBy: string | null;
  }[];
};

type PersonnelBasic = { id: string; tenantId: string; region: string | null };

type LinkedAssignment = {
  tenantId:                   string;
  status:                    string;
  seenAt:                    Date | null;
  actualStartedAt:           Date | null;
  actualCompletedAt:         Date | null;
  customerSignatureRequired: boolean;
};

type AssignmentRow = {
  id: string;
  code: string | null;
  title: string;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  seenAt: Date | string | null;
  actualStartedAt: Date | string | null;
  actualCompletedAt: Date | string | null;
  completionReason: string | null;
  completionNotes: string | null;
  customerSignatureRequired: boolean;
  customerSignatureDataUrl: string | null;
  status: string;
  customerName: string | null;
  contactName: string | null;
  phone: string | null;
  objectName: string | null;
  objectAddress: string | null;
  objectCity: string | null;
  objectPostalCode: string | null;
  requiredRegion: string | null;
};

type AssignmentDetailRow = AssignmentRow & {
  description: string | null;
};

type AssignmentTaskRow = {
  id: string;
  sortOrder: number;
  notes: string | null;
  completedAt: Date | string | null;
  completedBy: string | null;
};

const NOT_COMPLETED_REASONS = new Set([
  "Klant niet aanwezig",
  "Geen toegang tot object",
  "Sleutel / toegangscode werkt niet",
  "Klant niet akkoord op locatie",
  "Tijd tekort",
  "Meerwerk nodig",
  "Materiaal / middelen ontbreken",
  "Onveilige situatie",
  "Opdrachtinformatie onduidelijk of onvolledig",
  "Klant / locatie annuleert op locatie",
  "Overig",
]);

async function getPersonnelBasic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<PersonnelBasic | null> {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) return null;

  const { data } = await supabase
    .from("personnel")
    .select("id, tenant_id, region, is_active")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.id) return null;
  return { id: data.id, tenantId, region: data.region ?? null };
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).format(new Date());
}

function mapAssignmentRow(row: AssignmentRow): MyAssignment {
  return {
    id:               row.id,
    code:             row.code ?? "",
    title:            row.title,
    scheduledDate:    row.scheduledDate ?? null,
    scheduledStart:   row.scheduledStart ?? null,
    scheduledEnd:     row.scheduledEnd ?? null,
    seenAt:           toIsoString(row.seenAt),
    actualStartedAt:  toIsoString(row.actualStartedAt),
    actualCompletedAt: toIsoString(row.actualCompletedAt),
    completionReason: row.completionReason ?? null,
    completionNotes:  row.completionNotes ?? null,
    customerSignatureRequired: Boolean(row.customerSignatureRequired),
    customerSignatureDataUrl: row.customerSignatureDataUrl ?? null,
    status:           row.status,
    customerName:     row.customerName ?? null,
    contactName:      row.contactName ?? null,
    phone:            row.phone ?? null,
    objectName:       row.objectName ?? null,
    objectAddress:    row.objectAddress ?? null,
    objectCity:       row.objectCity ?? null,
    objectPostalCode: row.objectPostalCode ?? null,
    requiredRegion:   row.requiredRegion ?? null,
  };
}

function sortAssignments(a: MyAssignment, b: MyAssignment): number {
  const today = todayKey();
  const aFuture = (a.scheduledDate ?? "") >= today;
  const bFuture = (b.scheduledDate ?? "") >= today;
  if (aFuture && !bFuture) return -1;
  if (!aFuture && bFuture) return 1;
  if (aFuture && bFuture) {
    const byDate = (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");
    if (byDate !== 0) return byDate;
    return (a.scheduledStart ?? "99:99").localeCompare(b.scheduledStart ?? "99:99");
  }
  return (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? "");
}

export async function getMyAssignments(): Promise<MyAssignment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return [];

  const rows: AssignmentRow[] = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      seenAt: assignmentsTable.seenAt,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      completionReason: assignmentsTable.completionReason,
      completionNotes: assignmentsTable.completionNotes,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
      status: assignmentsTable.status,
      requiredRegion: assignmentsTable.requiredRegion,
      customerName: customersTable.name,
      contactName: objectsTable.contactName,
      phone: objectsTable.contactPhone,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
      objectPostalCode: objectsTable.postalCode,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnel.id),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, personnel.tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    );

  return rows.map(mapAssignmentRow).sort(sortAssignments);
}

export async function getMyAssignment(id: string): Promise<MyAssignmentDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return null;

  const [row] = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      seenAt: assignmentsTable.seenAt,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      completionReason: assignmentsTable.completionReason,
      completionNotes: assignmentsTable.completionNotes,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
      status: assignmentsTable.status,
      requiredRegion: assignmentsTable.requiredRegion,
      customerName: customersTable.name,
      contactName: objectsTable.contactName,
      phone: objectsTable.contactPhone,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
      objectPostalCode: objectsTable.postalCode,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnel.id),
        eq(assignmentPersonnelTable.assignmentId, id),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, personnel.tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  const tasks: AssignmentTaskRow[] = await db
    .select({
      id: assignmentTasksTable.id,
      sortOrder: assignmentTasksTable.sortOrder,
      notes: assignmentTasksTable.notes,
      completedAt: assignmentTasksTable.completedAt,
      completedBy: assignmentTasksTable.completedBy,
    })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, id))
    .orderBy(assignmentTasksTable.sortOrder);

  return {
    ...mapAssignmentRow(row as AssignmentDetailRow),
    description: row.description ?? null,
    tasks: tasks.map((task) => ({
      id:          task.id,
      sortOrder:   task.sortOrder,
      notes:       task.notes ?? null,
      completedAt: toIsoString(task.completedAt),
      completedBy: task.completedBy ?? null,
    })),
  };
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  plannable:   ["scheduled", "in_progress"],
  scheduled:   ["seen", "in_progress"],
  seen:        ["in_progress"],
  in_progress: ["completed", "not_completed"],
};

async function getLinkedAssignment(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<LinkedAssignment | null> {
  const [row] = await db
    .select({
      tenantId:                   assignmentsTable.tenantId,
      status:                    assignmentsTable.status,
      seenAt:                    assignmentsTable.seenAt,
      actualStartedAt:           assignmentsTable.actualStartedAt,
      actualCompletedAt:         assignmentsTable.actualCompletedAt,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnelId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  return row ?? null;
}

function isSignatureDataUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^data:image\/(png|jpeg|webp);base64,/.test(value);
}

function revalidateAssignmentPaths(assignmentId: string) {
  revalidatePath("/");
  revalidatePath("/opdrachten");
  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/afronden`);
}

async function notifyAssignmentWorkflow(input: {
  eventKey: string;
  assignmentId: string;
  actorUserId: string;
  audience?: "customer" | "personnel" | "management" | "mixed";
  recipients?: { customerIds?: string[]; personnelIds?: string[] };
}) {
  try {
    await emitAssignmentWorkflowEvent(input);
  } catch (error) {
    console.error("assignment workflow notification failed", {
      eventKey: input.eventKey,
      assignmentId: input.assignmentId,
      error,
    });
  }
}

export async function setAssignmentStatus(
  assignmentId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };

  const currentStatus = current.status;
  const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return { success: false, error: "Status-overgang niet toegestaan" };
  }

  const now = new Date();
  const updateValues: Partial<typeof assignmentsTable.$inferInsert> = {
    status:    newStatus,
    updatedAt: now,
  };

  if (newStatus === "seen") {
    updateValues.seenAt = current.seenAt ?? now;
  }
  if (newStatus === "in_progress") {
    updateValues.seenAt = current.seenAt ?? now;
    updateValues.actualStartedAt = current.actualStartedAt ?? now;
  }
  if (newStatus === "completed" || newStatus === "not_completed") {
    updateValues.actualCompletedAt = current.actualCompletedAt ?? now;
  }

  try {
    await db
      .update(assignmentsTable)
      .set(updateValues)
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, current.tenantId)));
  } catch {
    return { success: false, error: "Bijwerken mislukt" };
  }

  if (newStatus === "seen") {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_seen",
      assignmentId,
      actorUserId: user.id,
      audience: "management",
    });
  }
  if (newStatus === "in_progress") {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_started",
      assignmentId,
      actorUserId: user.id,
      audience: "management",
    });
  }

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}

export async function startAssignment(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  return setAssignmentStatus(assignmentId, "in_progress");
}

export async function setAssignmentTaskCompletion(
  assignmentId: string,
  taskId: string,
  completed: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };
  if (["report_submitted", "report_approved", "invoice_ready", "invoiced", "paid", "closed"].includes(current.status)) {
    return { success: false, error: "Deze werkbon is afgesloten voor wijzigingen" };
  }

  const [task] = await db
    .select({ id: assignmentTasksTable.id })
    .from(assignmentTasksTable)
    .where(
      and(
        eq(assignmentTasksTable.id, taskId),
        eq(assignmentTasksTable.assignmentId, assignmentId),
      ),
    )
    .limit(1);

  if (!task) return { success: false, error: "Taak niet gevonden" };

  try {
    await db
      .update(assignmentTasksTable)
      .set({
        completedAt: completed ? new Date() : null,
        completedBy: completed ? user.id : null,
      })
      .where(
        and(
          eq(assignmentTasksTable.id, taskId),
          eq(assignmentTasksTable.assignmentId, assignmentId),
        ),
      );
  } catch {
    return { success: false, error: "Taak bijwerken mislukt" };
  }

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}

export async function completeAssignment(
  assignmentId: string,
  input: { customerSignatureDataUrl?: string | null; notes?: string | null } = {},
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };
  if (current.status !== "in_progress") {
    return { success: false, error: "Start de werkbon voordat je deze afrondt" };
  }

  const signature = input.customerSignatureDataUrl ?? null;
  if (current.customerSignatureRequired && !isSignatureDataUrl(signature)) {
    return { success: false, error: "Handtekening klant is verplicht" };
  }

  const now = new Date();

  try {
    await db
      .update(assignmentsTable)
      .set({
        status:                   "completed",
        actualCompletedAt:        now,
        completionReason:         null,
        completionNotes:          input.notes?.trim() || null,
        customerSignatureDataUrl: isSignatureDataUrl(signature) ? signature : null,
        customerSignedAt:         isSignatureDataUrl(signature) ? now : null,
        updatedAt:                now,
      })
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, current.tenantId)));
  } catch {
    return { success: false, error: "Afronden mislukt" };
  }

  await notifyAssignmentWorkflow({
    eventKey: "assignment_completed",
    assignmentId,
    actorUserId: user.id,
    audience: "mixed",
  });

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}

export async function notCompleteAssignment(
  assignmentId: string,
  input: { reason: string; notes?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };
  if (current.status !== "in_progress") {
    return { success: false, error: "Start de werkbon voordat je deze afmeldt" };
  }

  const reason = input.reason.trim();
  const notes = input.notes?.trim() ?? "";
  if (!NOT_COMPLETED_REASONS.has(reason)) {
    return { success: false, error: "Kies een geldige reden" };
  }
  if (reason === "Overig" && !notes) {
    return { success: false, error: "Vul een toelichting in bij Overig" };
  }

  const now = new Date();

  try {
    await db
      .update(assignmentsTable)
      .set({
        status:                   "not_completed",
        actualCompletedAt:        now,
        completionReason:         reason,
        completionNotes:          notes || null,
        customerSignatureDataUrl: null,
        customerSignedAt:         null,
        updatedAt:                now,
      })
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, current.tenantId)));
  } catch {
    return { success: false, error: "Afmelden mislukt" };
  }

  await notifyAssignmentWorkflow({
    eventKey: "assignment_not_completed",
    assignmentId,
    actorUserId: user.id,
    audience: "management",
  });

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}
