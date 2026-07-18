"use server";

import {
  assignmentPersonnelTable,
  assignmentsTable,
  assignmentTasksTable,
  assignmentParticipantExecutionsTable,
  customersTable,
  db,
  objectsTable,
  buildAssignmentTimeProjection,
  executeAssignmentParticipantAction,
} from "@workspace/db";
import { emitAssignmentWorkflowEvent } from "@workspace/db/workflow-events";
import { safelyInvalidateAssignmentRouteContexts } from "@workspace/db/planning-realtime";
import { and, eq, ne } from "drizzle-orm";
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
  actualStart:      string | null;
  actualEnd:        string | null;
  effectiveStart:   string | null;
  effectiveEnd:     string | null;
  seenAt:           string | null;
  enRouteAt:        string | null;
  actualStartedAt:  string | null;
  actualCompletedAt: string | null;
  completionReason: string | null;
  completionNotes:  string | null;
  customerSignatureRequired: boolean;
  customerSignatureDataUrl: string | null;
  status:           string;
  participantStatus: string | null;
  participantVersion: number | null;
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
  participantStatus:         string | null;
  participantVersion:        number | null;
  seenAt:                    Date | null;
  enRouteAt:                 Date | null;
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
  enRouteAt: Date | string | null;
  actualStartedAt: Date | string | null;
  actualCompletedAt: Date | string | null;
  completionReason: string | null;
  completionNotes: string | null;
  customerSignatureRequired: boolean;
  customerSignatureDataUrl: string | null;
  status: string;
  participantStatus: string | null;
  participantVersion: number | null;
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
  const timeProjection = buildAssignmentTimeProjection({
    scheduledStart: row.scheduledStart ?? null,
    scheduledEnd: row.scheduledEnd ?? null,
    actualStartedAt: row.actualStartedAt,
    actualCompletedAt: row.actualCompletedAt,
  });

  return {
    id:               row.id,
    code:             row.code ?? "",
    title:            row.title,
    scheduledDate:    row.scheduledDate ?? null,
    scheduledStart:   timeProjection.plannedStart,
    scheduledEnd:     timeProjection.plannedEnd,
    actualStart:      timeProjection.actualStart,
    actualEnd:        timeProjection.actualEnd,
    effectiveStart:   timeProjection.effectiveStart,
    effectiveEnd:     timeProjection.effectiveEnd,
    seenAt:           toIsoString(row.seenAt),
    enRouteAt:        toIsoString(row.enRouteAt),
    actualStartedAt:  toIsoString(row.actualStartedAt),
    actualCompletedAt: toIsoString(row.actualCompletedAt),
    completionReason: row.completionReason ?? null,
    completionNotes:  row.completionNotes ?? null,
    customerSignatureRequired: Boolean(row.customerSignatureRequired),
    customerSignatureDataUrl: row.customerSignatureDataUrl ?? null,
    status:           row.status,
    participantStatus: row.participantStatus ?? null,
    participantVersion: row.participantVersion ?? null,
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
    return (a.effectiveStart ?? a.scheduledStart ?? "99:99").localeCompare(b.effectiveStart ?? b.scheduledStart ?? "99:99");
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
      enRouteAt: assignmentsTable.enRouteAt,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      completionReason: assignmentsTable.completionReason,
      completionNotes: assignmentsTable.completionNotes,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
      status: assignmentsTable.status,
      participantStatus: assignmentParticipantExecutionsTable.participantStatus,
      participantVersion: assignmentParticipantExecutionsTable.version,
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
    .leftJoin(
      assignmentParticipantExecutionsTable,
      and(
        eq(assignmentParticipantExecutionsTable.assignmentPersonnelId, assignmentPersonnelTable.id),
        ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
      ),
    )
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
      enRouteAt: assignmentsTable.enRouteAt,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      completionReason: assignmentsTable.completionReason,
      completionNotes: assignmentsTable.completionNotes,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
      status: assignmentsTable.status,
      participantStatus: assignmentParticipantExecutionsTable.participantStatus,
      participantVersion: assignmentParticipantExecutionsTable.version,
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
    .leftJoin(
      assignmentParticipantExecutionsTable,
      and(
        eq(assignmentParticipantExecutionsTable.assignmentPersonnelId, assignmentPersonnelTable.id),
        ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
      ),
    )
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
  assigned:    ["seen", "en_route", "in_progress"],
  plannable:   ["scheduled", "en_route", "in_progress"],
  scheduled:   ["seen", "en_route", "in_progress"],
  seen:        ["en_route", "in_progress"],
  en_route:    ["in_progress"],
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
      participantStatus:         assignmentParticipantExecutionsTable.participantStatus,
      participantVersion:        assignmentParticipantExecutionsTable.version,
      seenAt:                    assignmentsTable.seenAt,
      enRouteAt:                 assignmentsTable.enRouteAt,
      actualStartedAt:           assignmentsTable.actualStartedAt,
      actualCompletedAt:         assignmentsTable.actualCompletedAt,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .leftJoin(
      assignmentParticipantExecutionsTable,
      and(
        eq(assignmentParticipantExecutionsTable.assignmentPersonnelId, assignmentPersonnelTable.id),
        ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
      ),
    )
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

const ROUTE_REFRESH_STATUS_REASONS = {
  en_route: "status_en_route",
  in_progress: "status_in_progress",
} as const;

export async function setAssignmentStatus(
  assignmentId: string,
  newStatus: string,
  options: { expectedParticipantVersion?: number | null; clientMutationId?: string | null } = {},
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };

  if (typeof options.expectedParticipantVersion === "number" && current.participantVersion !== null && current.participantVersion !== options.expectedParticipantVersion) {
    return { success: false, error: "Conflict: deze werkbon is aangepast. Ververs en probeer opnieuw." };
  }

  const currentStatus = current.participantStatus ?? current.status;
  const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return { success: false, error: "Status-overgang niet toegestaan" };
  }

  const action = newStatus === "in_progress" ? "start" : newStatus === "en_route" ? "en_route" : newStatus === "seen" ? "seen" : null;
  if (!action) return { success: false, error: "Gebruik de afrond-actie voor deze status" };

  try {
    await executeAssignmentParticipantAction({
      assignmentId,
      personnelId: personnel.id,
      actorUserId: user.id,
      action,
      idempotencyKey: `${action}:${assignmentId}:${personnel.id}`,
      auditMetadata: {
        source: "personnel-pwa",
        previousStatus: currentStatus,
        expectedParticipantVersion: options.expectedParticipantVersion ?? null,
        clientMutationId: options.clientMutationId ?? null,
      },
    });
  } catch (error) {
    console.error("assignment participant action failed", { assignmentId, personnelId: personnel.id, action, error });
    return { success: false, error: "Bijwerken mislukt" };
  }

  // Legacy one-shot guard was isNull(assignmentsTable.enRouteAt); the participant RPC now serializes the write.
  let firstEnRouteTrigger = false;
  firstEnRouteTrigger = newStatus === "en_route" && current.enRouteAt == null;

  if (newStatus === "seen") {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_seen",
      assignmentId,
      actorUserId: user.id,
      audience: "management",
    });
  }
  if (newStatus === "en_route" && firstEnRouteTrigger) {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_en_route",
      assignmentId,
      actorUserId: user.id,
      audience: "customer",
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

  const routeRefreshReason =
    ROUTE_REFRESH_STATUS_REASONS[
      newStatus as keyof typeof ROUTE_REFRESH_STATUS_REASONS
    ];
  if (routeRefreshReason) {
    await safelyInvalidateAssignmentRouteContexts({
      tenantId: current.tenantId,
      assignmentId,
      reason: routeRefreshReason,
      status: newStatus,
      previousStatus: currentStatus,
      personnelIds: [personnel.id],
      source: "personnel-pwa",
    });
  }

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}

export async function startAssignment(
  assignmentId: string,
  options: { expectedParticipantVersion?: number | null; clientMutationId?: string | null } = {},
): Promise<{ success: boolean; error?: string }> {
  return setAssignmentStatus(assignmentId, "in_progress", options);
}

export async function markAssignmentEnRoute(
  assignmentId: string,
  options: { expectedParticipantVersion?: number | null; clientMutationId?: string | null } = {},
): Promise<{ success: boolean; error?: string }> {
  return setAssignmentStatus(assignmentId, "en_route", options);
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
  input: { customerSignatureDataUrl?: string | null; notes?: string | null; expectedParticipantVersion?: number | null; clientMutationId?: string | null } = {},
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };
  if (typeof input.expectedParticipantVersion === "number" && current.participantVersion !== null && current.participantVersion !== input.expectedParticipantVersion) {
    return { success: false, error: "Conflict: deze werkbon is aangepast. Ververs en probeer opnieuw." };
  }
  const currentStatus = current.participantStatus ?? current.status;
  if (currentStatus === "completed") {
    revalidateAssignmentPaths(assignmentId);
    return { success: true };
  }
  if (currentStatus !== "in_progress") {
    return { success: false, error: "Start de werkbon voordat je deze afrondt" };
  }

  const signature = input.customerSignatureDataUrl ?? null;
  if (current.customerSignatureRequired && !isSignatureDataUrl(signature)) {
    return { success: false, error: "Handtekening klant is verplicht" };
  }

  const now = new Date();
  let executionResult: Awaited<ReturnType<typeof executeAssignmentParticipantAction>>;

  try {
    executionResult = await executeAssignmentParticipantAction({
      assignmentId,
      personnelId: personnel.id,
      actorUserId: user.id,
      action: "complete",
      idempotencyKey: `complete:${assignmentId}:${personnel.id}`,
      completionNotes: input.notes?.trim() || null,
      auditMetadata: {
        source: "personnel-pwa",
        signatureProvided: isSignatureDataUrl(signature),
        expectedParticipantVersion: input.expectedParticipantVersion ?? null,
        clientMutationId: input.clientMutationId ?? null,
      },
    });
    if (executionResult.aggregateCompleted) {
      await db
        .update(assignmentsTable)
        .set({
          completionReason:         null,
          completionNotes:          input.notes?.trim() || null,
          customerSignatureDataUrl: isSignatureDataUrl(signature) ? signature : null,
          customerSignedAt:         isSignatureDataUrl(signature) ? now : null,
          updatedAt:                now,
        })
        .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, current.tenantId)));
    }
  } catch {
    return { success: false, error: "Afronden mislukt" };
  }

  await notifyAssignmentWorkflow({
    eventKey: "assignment_completed",
    assignmentId,
    actorUserId: user.id,
    audience: "mixed",
  });

  await safelyInvalidateAssignmentRouteContexts({
    tenantId: current.tenantId,
    assignmentId,
    reason: "status_completed",
    status: "completed",
    previousStatus: currentStatus,
    personnelIds: [personnel.id],
    source: "personnel-pwa",
  });

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}

export async function notCompleteAssignment(
  assignmentId: string,
  input: { reason: string; notes?: string | null; expectedParticipantVersion?: number | null; clientMutationId?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const current = await getLinkedAssignment(personnel.id, personnel.tenantId, assignmentId);
  if (!current) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };
  if (typeof input.expectedParticipantVersion === "number" && current.participantVersion !== null && current.participantVersion !== input.expectedParticipantVersion) {
    return { success: false, error: "Conflict: deze werkbon is aangepast. Ververs en probeer opnieuw." };
  }
  const currentStatus = current.participantStatus ?? current.status;
  if (currentStatus === "not_completed") {
    revalidateAssignmentPaths(assignmentId);
    return { success: true };
  }
  if (currentStatus !== "in_progress") {
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

  try {
    await executeAssignmentParticipantAction({
      assignmentId,
      personnelId: personnel.id,
      actorUserId: user.id,
      action: "not_complete",
      idempotencyKey: `not_complete:${assignmentId}:${personnel.id}`,
      completionReason: reason,
      completionNotes: notes || null,
      auditMetadata: {
        source: "personnel-pwa",
        expectedParticipantVersion: input.expectedParticipantVersion ?? null,
        clientMutationId: input.clientMutationId ?? null,
      },
    });
    await db
      .update(assignmentsTable)
      .set({
        completionReason:         reason,
        completionNotes:          notes || null,
        customerSignatureDataUrl: null,
        customerSignedAt:         null,
        updatedAt:                new Date(),
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

  await safelyInvalidateAssignmentRouteContexts({
    tenantId: current.tenantId,
    assignmentId,
    reason: "status_not_completed",
    status: "not_completed",
    previousStatus: currentStatus,
    personnelIds: [personnel.id],
    source: "personnel-pwa",
  });

  revalidateAssignmentPaths(assignmentId);
  return { success: true };
}
