"use server";

import { db, assignmentsTable, assignmentPersonnelTable, isTenantModuleEnabled } from "@workspace/db";
import { assignmentTasksTable } from "@workspace/db";
import { emitAssignmentWorkflowEvent } from "@workspace/db/workflow-events";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
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
  const { data } = await supabase
    .from("personnel")
    .select("id, tenant_id, region, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!data?.tenant_id) return null;
  if (!(await isTenantModuleEnabled(data.tenant_id, "personnel_portal"))) return null;

  return { id: data.id, tenantId: data.tenant_id, region: data.region ?? null };
}

/** Returns true if the assignment is region-compatible with the personnel member. */
function meetsRegion(personnelRegion: string | null, requiredRegion: string | null): boolean {
  if (!requiredRegion) return true;           // no requirement → open to all
  if (!personnelRegion) return true;          // worker has no region set → don't restrict
  return requiredRegion.toLowerCase().includes(personnelRegion.toLowerCase()) ||
    personnelRegion.toLowerCase().includes(requiredRegion.toLowerCase());
}

export async function getMyAssignments(): Promise<MyAssignment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return [];

  const { data } = await supabase
    .from("assignment_personnel")
    .select(`
      assignments!inner(
        id, code, title, scheduled_date, scheduled_start, scheduled_end,
        tenant_id,
        seen_at, actual_started_at, actual_completed_at,
        completion_reason, completion_notes,
        customer_signature_required, customer_signature_data_url,
        status,
        required_region,
        customers(name),
        objects(name, address, city, postal_code, contact_name, contact_phone)
      )
    `)
    .eq("personnel_id", personnel.id)
    .eq("status", "assigned")
    .eq("assignments.tenant_id", personnel.tenantId);

  if (!data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map((row) => {
      const a = row.assignments;
      return {
        id:               a.id,
        code:             a.code ?? "",
        title:            a.title,
        scheduledDate:    a.scheduled_date ?? null,
        scheduledStart:   a.scheduled_start ?? null,
        scheduledEnd:     a.scheduled_end ?? null,
        seenAt:           a.seen_at ?? null,
        actualStartedAt:  a.actual_started_at ?? null,
        actualCompletedAt: a.actual_completed_at ?? null,
        completionReason: a.completion_reason ?? null,
        completionNotes:  a.completion_notes ?? null,
        customerSignatureRequired: Boolean(a.customer_signature_required),
        customerSignatureDataUrl: a.customer_signature_data_url ?? null,
        status:           a.status,
        customerName:     a.customers?.name ?? null,
        contactName:      a.objects?.contact_name ?? null,
        phone:            a.objects?.contact_phone ?? null,
        objectName:       a.objects?.name ?? null,
        objectAddress:    a.objects?.address ?? null,
        objectCity:       a.objects?.city ?? null,
        objectPostalCode: a.objects?.postal_code ?? null,
        requiredRegion:   a.required_region ?? null,
      } as MyAssignment;
    })
    // Filter by region: hide assignments whose required_region doesn't match
    .filter((a) => meetsRegion(personnel.region, a.requiredRegion))
    .sort((a, b) => {
      // Upcoming first, then descending
      const today = new Date().toISOString().slice(0, 10);
      const aFuture = (a.scheduledDate ?? "") >= today;
      const bFuture = (b.scheduledDate ?? "") >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");
      return (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? "");
    });
}

export async function getMyAssignment(id: string): Promise<MyAssignmentDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const personnel = await getPersonnelBasic(supabase, user.id);
  if (!personnel) return null;

  const { data } = await supabase
    .from("assignment_personnel")
    .select(`
      assignments!inner(
        id, code, title, description, scheduled_date, scheduled_start, scheduled_end,
        tenant_id,
        seen_at, actual_started_at, actual_completed_at,
        completion_reason, completion_notes,
        customer_signature_required, customer_signature_data_url,
        status,
        required_region,
        customers(name),
        objects(name, address, city, postal_code, contact_name, contact_phone),
        assignment_tasks(id, sort_order, notes, completed_at, completed_by)
      )
    `)
    .eq("personnel_id", personnel.id)
    .eq("assignment_id", id)
    .eq("status", "assigned")
    .eq("assignments.tenant_id", personnel.tenantId)
    .single();

  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (data as any).assignments;
  if (!a) return null;

  return {
    id:               a.id,
    code:             a.code ?? "",
    title:            a.title,
    description:      a.description ?? null,
    scheduledDate:    a.scheduled_date ?? null,
    scheduledStart:   a.scheduled_start ?? null,
    scheduledEnd:     a.scheduled_end ?? null,
    seenAt:           a.seen_at ?? null,
    actualStartedAt:  a.actual_started_at ?? null,
    actualCompletedAt: a.actual_completed_at ?? null,
    completionReason: a.completion_reason ?? null,
    completionNotes:  a.completion_notes ?? null,
    customerSignatureRequired: Boolean(a.customer_signature_required),
    customerSignatureDataUrl: a.customer_signature_data_url ?? null,
    status:           a.status,
    customerName:     a.customers?.name ?? null,
    contactName:      a.objects?.contact_name ?? null,
    phone:            a.objects?.contact_phone ?? null,
    objectName:       a.objects?.name ?? null,
    objectAddress:    a.objects?.address ?? null,
    objectCity:       a.objects?.city ?? null,
    objectPostalCode: a.objects?.postal_code ?? null,
    requiredRegion:   a.required_region ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tasks: (a.assignment_tasks ?? []).map((t: any) => ({
      id:          t.id,
      sortOrder:   t.sort_order,
      notes:       t.notes ?? null,
      completedAt: t.completed_at ?? null,
      completedBy: t.completed_by ?? null,
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
