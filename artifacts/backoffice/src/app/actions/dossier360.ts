"use server";

import {
  db,
  dossierProfilesTable,
  dossierEventsTable,
  dossierNotesTable,
  dossierTasksTable,
  type DossierStatus,
  type DossierSubjectType,
} from "@workspace/db";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

const dossierSubjectSchema = z.discriminatedUnion("subjectType", [
  z.object({ subjectType: z.literal("personnel"), subjectId: z.string().uuid() }),
  z.object({ subjectType: z.literal("customer"), subjectId: z.string().uuid() }),
  z.object({ subjectType: z.literal("object"), subjectId: z.string().uuid() }),
]);

const subjectPermission: Record<DossierSubjectType, string> = {
  personnel: "personnel",
  customer: "customers",
  object: "objects",
};

export type DossierSummary = {
  id: string;
  dossierNumber: string;
  status: DossierStatus;
  managerAssigned: boolean;
  lastReviewedAt: string | null;
  openTaskCount: number;
  retentionPolicyKey: string | null;
  scheduledDeletionAt: string | null;
  legalHold: boolean;
  recordVersion: number;
};

export type DossierWorkspace = {
  summary: DossierSummary;
  capabilities: { manage: boolean; notes: boolean; timeline: boolean };
  notes: Array<{
    id: string;
    content: string;
    classification: string;
    correctionOfId: string | null;
    correctionReason: string | null;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    recordVersion: number;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    title: string;
    summary: string | null;
    occurredAt: string;
  }>;
};

export type DossierMutationResult = { ok: boolean; message: string };

const mutationSubjectSchema = dossierSubjectSchema.and(z.object({
  dossierProfileId: z.string().uuid(),
}));
const noteInputSchema = mutationSubjectSchema.and(z.object({
  content: z.string().trim().min(3).max(5_000),
  classification: z.enum(["internal", "confidential", "restricted"]).default("internal"),
  correctionOfId: z.string().uuid().nullable().optional(),
  correctionReason: z.string().trim().min(3).max(500).nullable().optional(),
})).superRefine((value, context) => {
  if (Boolean(value.correctionOfId) !== Boolean(value.correctionReason)) {
    context.addIssue({ code: "custom", message: "Een correctie vereist een bron en reden." });
  }
});
const taskInputSchema = mutationSubjectSchema.and(z.object({
  title: z.string().trim().min(3).max(240),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
}));
const reviewInputSchema = mutationSubjectSchema.and(z.object({
  recordVersion: z.number().int().positive(),
}));
const completeTaskInputSchema = mutationSubjectSchema.and(z.object({
  taskId: z.string().uuid(),
  recordVersion: z.number().int().positive(),
}));

/**
 * Reads common dossier metadata only. Subject data remains canonical in its
 * own domain table and every lookup is scoped by the current tenant.
 */
export async function getDossierSummary(input: {
  subjectType: DossierSubjectType;
  subjectId: string;
}): Promise<DossierSummary | null> {
  const parsed = dossierSubjectSchema.safeParse(input);
  if (!parsed.success) return null;

  await requirePermission(subjectPermission[parsed.data.subjectType], "read");
  const tenantId = await requireCurrentTenantId();
  const subjectPredicate = parsed.data.subjectType === "personnel"
    ? eq(dossierProfilesTable.personnelId, parsed.data.subjectId)
    : parsed.data.subjectType === "customer"
      ? eq(dossierProfilesTable.customerId, parsed.data.subjectId)
      : eq(dossierProfilesTable.objectId, parsed.data.subjectId);

  const [profile] = await db
    .select({
      id: dossierProfilesTable.id,
      dossierNumber: dossierProfilesTable.dossierNumber,
      status: dossierProfilesTable.status,
      managerUserId: dossierProfilesTable.managerUserId,
      lastReviewedAt: dossierProfilesTable.lastReviewedAt,
      retentionPolicyKey: dossierProfilesTable.retentionPolicyKey,
      scheduledDeletionAt: dossierProfilesTable.scheduledDeletionAt,
      legalHoldAt: dossierProfilesTable.legalHoldAt,
      recordVersion: dossierProfilesTable.recordVersion,
    })
    .from(dossierProfilesTable)
    .where(and(
      eq(dossierProfilesTable.tenantId, tenantId),
      eq(dossierProfilesTable.subjectType, parsed.data.subjectType),
      subjectPredicate,
    ))
    .limit(1);

  if (!profile) return null;

  const [taskCount] = await db
    .select({ value: count() })
    .from(dossierTasksTable)
    .where(and(
      eq(dossierTasksTable.tenantId, tenantId),
      eq(dossierTasksTable.dossierProfileId, profile.id),
      inArray(dossierTasksTable.status, ["open", "in_progress"]),
    ));

  return {
    id: profile.id,
    dossierNumber: profile.dossierNumber,
    status: profile.status,
    managerAssigned: Boolean(profile.managerUserId),
    lastReviewedAt: profile.lastReviewedAt?.toISOString() ?? null,
    openTaskCount: Number(taskCount?.value ?? 0),
    retentionPolicyKey: profile.retentionPolicyKey,
    scheduledDeletionAt: profile.scheduledDeletionAt?.toISOString() ?? null,
    legalHold: Boolean(profile.legalHoldAt),
    recordVersion: profile.recordVersion,
  };
}

function dossierPath(subjectType: DossierSubjectType, subjectId: string): string {
  if (subjectType === "personnel") return `/personnel/${subjectId}`;
  if (subjectType === "customer") return `/customers/${subjectId}`;
  return `/objects/${subjectId}`;
}

function dossierSubjectPredicate(subjectType: DossierSubjectType, subjectId: string) {
  if (subjectType === "personnel") return eq(dossierProfilesTable.personnelId, subjectId);
  if (subjectType === "customer") return eq(dossierProfilesTable.customerId, subjectId);
  return eq(dossierProfilesTable.objectId, subjectId);
}

async function requireDossierMutationContext(input: z.infer<typeof mutationSubjectSchema>) {
  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Uw sessie is verlopen. Meld u opnieuw aan.");
  const [profile] = await db
    .select({ id: dossierProfilesTable.id })
    .from(dossierProfilesTable)
    .where(and(
      eq(dossierProfilesTable.id, input.dossierProfileId),
      eq(dossierProfilesTable.tenantId, tenantId),
      eq(dossierProfilesTable.subjectType, input.subjectType),
      dossierSubjectPredicate(input.subjectType, input.subjectId),
    ))
    .limit(1);
  if (!profile) throw new Error("Dossier niet gevonden.");
  return { tenantId, userId: user.id, profileId: profile.id };
}

export async function getDossierWorkspace(input: {
  subjectType: DossierSubjectType;
  subjectId: string;
}): Promise<DossierWorkspace | null> {
  const summary = await getDossierSummary(input);
  if (!summary) return null;
  const [manage, notesAllowed, timeline] = await Promise.all([
    hasPermission("dossiers", "manage"),
    hasPermission("dossiers", "notes"),
    hasPermission("dossiers", "timeline"),
  ]);
  if (!manage && !notesAllowed && !timeline) return null;
  const tenantId = await requireCurrentTenantId();

  const [notes, tasks, events] = await Promise.all([
    notesAllowed
      ? db.select({
          id: dossierNotesTable.id,
          content: dossierNotesTable.content,
          classification: dossierNotesTable.classification,
          correctionOfId: dossierNotesTable.correctionOfId,
          correctionReason: dossierNotesTable.correctionReason,
          createdAt: dossierNotesTable.createdAt,
        }).from(dossierNotesTable).where(and(
          eq(dossierNotesTable.tenantId, tenantId),
          eq(dossierNotesTable.dossierProfileId, summary.id),
        )).orderBy(desc(dossierNotesTable.createdAt)).limit(20)
      : Promise.resolve([]),
    manage
      ? db.select({
          id: dossierTasksTable.id,
          title: dossierTasksTable.title,
          status: dossierTasksTable.status,
          priority: dossierTasksTable.priority,
          dueAt: dossierTasksTable.dueAt,
          recordVersion: dossierTasksTable.recordVersion,
        }).from(dossierTasksTable).where(and(
          eq(dossierTasksTable.tenantId, tenantId),
          eq(dossierTasksTable.dossierProfileId, summary.id),
        )).orderBy(desc(dossierTasksTable.createdAt)).limit(20)
      : Promise.resolve([]),
    timeline
      ? db.select({
          id: dossierEventsTable.id,
          eventType: dossierEventsTable.eventType,
          title: dossierEventsTable.title,
          summary: dossierEventsTable.summary,
          occurredAt: dossierEventsTable.occurredAt,
        }).from(dossierEventsTable).where(and(
          eq(dossierEventsTable.tenantId, tenantId),
          eq(dossierEventsTable.dossierProfileId, summary.id),
          inArray(dossierEventsTable.classification, ["normal", "internal"]),
        )).orderBy(desc(dossierEventsTable.occurredAt)).limit(25)
      : Promise.resolve([]),
  ]);

  return {
    summary,
    capabilities: { manage, notes: notesAllowed, timeline },
    notes: notes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
    tasks: tasks.map((task) => ({
      ...task,
      dueAt: task.dueAt?.toISOString() ?? null,
    })),
    events: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
  };
}

export async function addDossierNoteAction(raw: unknown): Promise<DossierMutationResult> {
  await requirePermission("dossiers", "notes");
  const parsed = noteInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Controleer de notitie en eventuele correctiereden." };
  try {
    const context = await requireDossierMutationContext(parsed.data);
    await db.transaction(async (tx) => {
      await tx.insert(dossierNotesTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        classification: parsed.data.classification,
        content: parsed.data.content,
        correctionOfId: parsed.data.correctionOfId ?? null,
        correctionReason: parsed.data.correctionReason ?? null,
        createdBy: context.userId,
      });
      await tx.insert(dossierEventsTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        actorUserId: context.userId,
        eventType: parsed.data.correctionOfId ? "note_corrected" : "note_added",
        title: parsed.data.correctionOfId ? "Dossiernotitie gecorrigeerd" : "Dossiernotitie toegevoegd",
        summary: parsed.data.correctionOfId ? "Er is een gemotiveerde correctie toegevoegd." : null,
        classification: "internal",
        sourceType: "dossier_note",
      });
    });
    revalidatePath(dossierPath(parsed.data.subjectType, parsed.data.subjectId));
    return { ok: true, message: parsed.data.correctionOfId ? "Correctie toegevoegd." : "Notitie toegevoegd." };
  } catch {
    return { ok: false, message: "De notitie kon niet veilig worden opgeslagen." };
  }
}

export async function createDossierTaskAction(raw: unknown): Promise<DossierMutationResult> {
  await requirePermission("dossiers", "manage");
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Controleer titel, prioriteit en vervaldatum." };
  try {
    const context = await requireDossierMutationContext(parsed.data);
    await db.transaction(async (tx) => {
      await tx.insert(dossierTasksTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        title: parsed.data.title,
        priority: parsed.data.priority,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        createdBy: context.userId,
      });
      await tx.insert(dossierEventsTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        actorUserId: context.userId,
        eventType: "task_created",
        title: "Dossiertaak toegevoegd",
        summary: parsed.data.title,
        classification: "internal",
        sourceType: "dossier_task",
      });
    });
    revalidatePath(dossierPath(parsed.data.subjectType, parsed.data.subjectId));
    return { ok: true, message: "Taak toegevoegd." };
  } catch {
    return { ok: false, message: "De taak kon niet worden opgeslagen." };
  }
}

export async function markDossierReviewedAction(raw: unknown): Promise<DossierMutationResult> {
  await requirePermission("dossiers", "manage");
  const parsed = reviewInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Het dossier is gewijzigd. Vernieuw de pagina." };
  try {
    const context = await requireDossierMutationContext(parsed.data);
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(dossierProfilesTable).set({
        lastReviewedAt: new Date(),
        lastReviewedBy: context.userId,
      }).where(and(
        eq(dossierProfilesTable.tenantId, context.tenantId),
        eq(dossierProfilesTable.id, context.profileId),
        eq(dossierProfilesTable.recordVersion, parsed.data.recordVersion),
      )).returning({ id: dossierProfilesTable.id });
      if (!updated) throw new Error("stale dossier");
      await tx.insert(dossierEventsTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        actorUserId: context.userId,
        eventType: "dossier_reviewed",
        title: "Dossier beoordeeld",
        classification: "internal",
        sourceType: "dossier_profile",
        sourceId: context.profileId,
      });
    });
    revalidatePath(dossierPath(parsed.data.subjectType, parsed.data.subjectId));
    return { ok: true, message: "Dossier als beoordeeld gemarkeerd." };
  } catch {
    return { ok: false, message: "Het dossier is intussen gewijzigd. Vernieuw de pagina." };
  }
}

export async function completeDossierTaskAction(raw: unknown): Promise<DossierMutationResult> {
  await requirePermission("dossiers", "manage");
  const parsed = completeTaskInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "De taakgegevens zijn niet geldig." };
  try {
    const context = await requireDossierMutationContext(parsed.data);
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(dossierTasksTable).set({
        status: "completed",
        completedAt: new Date(),
        completedBy: context.userId,
      }).where(and(
        eq(dossierTasksTable.tenantId, context.tenantId),
        eq(dossierTasksTable.dossierProfileId, context.profileId),
        eq(dossierTasksTable.id, parsed.data.taskId),
        eq(dossierTasksTable.recordVersion, parsed.data.recordVersion),
        inArray(dossierTasksTable.status, ["open", "in_progress"]),
      )).returning({ title: dossierTasksTable.title });
      if (!updated) throw new Error("stale task");
      await tx.insert(dossierEventsTable).values({
        tenantId: context.tenantId,
        dossierProfileId: context.profileId,
        actorUserId: context.userId,
        eventType: "task_completed",
        title: "Dossiertaak afgerond",
        summary: updated.title,
        classification: "internal",
        sourceType: "dossier_task",
        sourceId: parsed.data.taskId,
      });
    });
    revalidatePath(dossierPath(parsed.data.subjectType, parsed.data.subjectId));
    return { ok: true, message: "Taak afgerond." };
  } catch {
    return { ok: false, message: "De taak is intussen gewijzigd. Vernieuw de pagina." };
  }
}
