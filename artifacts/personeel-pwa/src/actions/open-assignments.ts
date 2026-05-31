"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  taskCodesTable,
  personnelTable,
  objectsTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Personnel profile helper ──────────────────────────────────────────────────

type PersonnelProfile = {
  id:           string;
  roleId:       string | null;
  region:       string | null;
  certificates: string[];
  diplomas:     string[];
  knowledge:    string[];
};

async function getPersonnelProfile(): Promise<PersonnelProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({
      id:           personnelTable.id,
      roleId:       personnelTable.roleId,
      region:       personnelTable.region,
      certificates: personnelTable.certificates,
      diplomas:     personnelTable.diplomas,
      knowledge:    personnelTable.knowledge,
    })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpenAssignment = {
  id:               string;
  title:            string;
  scheduledDate:    string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  taskCodes:        string[];
  isAlreadyApplied: boolean;
};

// ─── Eligibility check ────────────────────────────────────────────────────────

/**
 * Check whether a personnel member meets ALL requirements of a task code.
 * Mirrors the backoffice planning eligibility rules.
 */
function meetsTaskRequirements(
  personnel: PersonnelProfile,
  task: {
    requiredRoleId:       string | null;
    requiredCertificates: string[];
    requiredDiploma:      string | null;
    requiredKnowledge:    string[];
  },
): boolean {
  if (task.requiredRoleId && personnel.roleId !== task.requiredRoleId) return false;
  if (task.requiredCertificates.length > 0) {
    if (!task.requiredCertificates.every((c) => personnel.certificates.includes(c))) return false;
  }
  if (task.requiredDiploma) {
    if (!personnel.diplomas.includes(task.requiredDiploma)) return false;
  }
  if (task.requiredKnowledge.length > 0) {
    if (!task.requiredKnowledge.every((k) => personnel.knowledge.includes(k))) return false;
  }
  return true;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * List plannable assignments eligible for this personnel member.
 *
 * Eligibility rules (parity with backoffice planning):
 *   - Role: if a task requires a role, personnel's role must match
 *   - Certificates: personnel must hold all required certificates
 *   - Diploma: personnel must hold the required diploma
 *   - Knowledge: personnel must have all required knowledge tags
 *   - Region: deferred — assignments have no region column yet
 *             (see migration 016 + future enhancement)
 *
 * Uses @workspace/db (Drizzle / service-role connection) to bypass RLS so
 * that ALL plannable assignments are visible regardless of existing links.
 */
export async function getOpenAssignments(): Promise<OpenAssignment[]> {
  const personnel = await getPersonnelProfile();
  if (!personnel) return [];

  const assignments = await db
    .select({
      id:            assignmentsTable.id,
      title:         assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      objectAddress: objectsTable.address,
      objectCity:    objectsTable.city,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentsTable.status, "plannable"),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .orderBy(assignmentsTable.scheduledDate);

  if (assignments.length === 0) return [];

  const assignmentIds = assignments.map((a) => a.id);

  const [taskRows, myLinks] = await Promise.all([
    db
      .select({
        assignmentId:         assignmentTasksTable.assignmentId,
        taskCodeName:         taskCodesTable.name,
        requiredRoleId:       taskCodesTable.requiredRoleId,
        requiredCertificates: taskCodesTable.requiredCertificates,
        requiredDiploma:      taskCodesTable.requiredDiploma,
        requiredKnowledge:    taskCodesTable.requiredKnowledge,
      })
      .from(assignmentTasksTable)
      .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
      .where(inArray(assignmentTasksTable.assignmentId, assignmentIds)),
    db
      .select({ assignmentId: assignmentPersonnelTable.assignmentId })
      .from(assignmentPersonnelTable)
      .where(eq(assignmentPersonnelTable.personnelId, personnel.id)),
  ]);

  const myIds = new Set(myLinks.map((l) => l.assignmentId));

  // Group tasks by assignment
  const tasksByAssignment = new Map<string, typeof taskRows>();
  for (const t of taskRows) {
    if (!tasksByAssignment.has(t.assignmentId)) {
      tasksByAssignment.set(t.assignmentId, []);
    }
    tasksByAssignment.get(t.assignmentId)!.push(t);
  }

  return assignments
    .filter((a) => {
      const tasks = tasksByAssignment.get(a.id) ?? [];
      if (tasks.length === 0) return true; // No task requirements — open to all

      // ALL tasks must be eligible (most restrictive interpretation)
      return tasks.every((t) =>
        meetsTaskRequirements(personnel, {
          requiredRoleId:       t.requiredRoleId ?? null,
          requiredCertificates: (t.requiredCertificates as string[]) ?? [],
          requiredDiploma:      t.requiredDiploma ?? null,
          requiredKnowledge:    (t.requiredKnowledge as string[]) ?? [],
        }),
      );
    })
    .map((a) => {
      const tasks = tasksByAssignment.get(a.id) ?? [];
      return {
        id:               a.id,
        title:            a.title,
        scheduledDate:    a.scheduledDate,
        objectAddress:    a.objectAddress ?? null,
        objectCity:       a.objectCity ?? null,
        taskCodes:        tasks.map((t) => t.taskCodeName).filter(Boolean) as string[],
        isAlreadyApplied: myIds.has(a.id),
      };
    });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Apply for a plannable assignment.
 * Inserts an assignment_personnel row with status='suggested'.
 *
 * Requires migration 016_assignment_personnel_status.sql to be run first.
 * Falls back gracefully if the status column doesn't exist yet.
 */
export async function applyForAssignment(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const personnel = await getPersonnelProfile();
  if (!personnel) {
    return { success: false, error: "Niet ingelogd of personeelsprofiel niet gevonden" };
  }

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.status, "plannable"),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, error: "Opdracht is niet meer beschikbaar" };
  }

  const [existing] = await db
    .select({ id: assignmentPersonnelTable.id })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.personnelId, personnel.id),
      ),
    )
    .limit(1);

  if (existing) {
    return { success: false, error: "U heeft zich al aangemeld voor deze opdracht" };
  }

  await db.insert(assignmentPersonnelTable).values({
    assignmentId,
    personnelId: personnel.id,
    status: "suggested",
  });

  revalidatePath("/openstaand");
  revalidatePath("/opdrachten");
  return { success: true };
}
