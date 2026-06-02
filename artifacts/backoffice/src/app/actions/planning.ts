"use server";

import { db } from "@workspace/db";
import {
  personnelTable,
  rolesTable,
  assignmentTasksTable,
  taskCodesTable,
  assignmentPersonnelTable,
  assignmentsTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getBatchAvailabilityStatus, type AvailabilityStatus } from "./availability";
import type { ActionResult } from "./customers";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssignmentRequirements = {
  requiredRoleIds:      string[];
  requiredCertificates: string[];
  requiredKnowledge:    string[];
  requiredDiplomas:     string[];
  /** Required region from assignments.required_region — null means no restriction */
  assignmentRegion:     string | null;
  /** The assignment's scheduled date (YYYY-MM-DD) — used for availability lookup */
  scheduledDate:        string | null;
};

export type PersonnelEligibilityEntry = {
  personnelId:        string;
  linkId:             string | null;
  firstName:          string;
  lastName:           string;
  roleId:             string | null;
  roleName:           string | null;
  region:             string | null;
  certificates:       string[];
  diplomas:           string[];
  knowledge:          string[];
  isActive:           boolean;
  availabilityStatus: AvailabilityStatus;
};

export type PersonnelForAssignmentResult = {
  requirements: AssignmentRequirements;
  personnel:    PersonnelEligibilityEntry[];
};

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Returns the union of task-code requirements for the assignment,
 * all active personnel (with role and availability), and which are already assigned.
 * Also loads region + scheduled date so the drawer can show region-match badges
 * and colour-coded availability indicators.
 */
export async function getPersonnelForAssignment(
  assignmentId: string,
): Promise<PersonnelForAssignmentResult | null> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return null;

  const [taskRows, personnelRows, assignedRows, [assignmentRow]] = await Promise.all([
    db
      .select({
        requiredRoleId:       taskCodesTable.requiredRoleId,
        requiredCertificates: taskCodesTable.requiredCertificates,
        requiredKnowledge:    taskCodesTable.requiredKnowledge,
        requiredDiploma:      taskCodesTable.requiredDiploma,
      })
      .from(assignmentTasksTable)
      .innerJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
      .where(eq(assignmentTasksTable.assignmentId, assignmentId)),

    db
      .select({
        id:           personnelTable.id,
        firstName:    personnelTable.firstName,
        lastName:     personnelTable.lastName,
        roleId:       personnelTable.roleId,
        roleName:     rolesTable.name,
        region:       personnelTable.region,
        certificates: personnelTable.certificates,
        diplomas:     personnelTable.diplomas,
        knowledge:    personnelTable.knowledge,
        isActive:     personnelTable.isActive,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .where(eq(personnelTable.isActive, true))
      .orderBy(personnelTable.lastName),

    db
      .select({
        linkId:      assignmentPersonnelTable.id,
        personnelId: assignmentPersonnelTable.personnelId,
      })
      .from(assignmentPersonnelTable)
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentId),
          eq(assignmentPersonnelTable.status, "assigned"),
        ),
      ),

    db
      .select({
        scheduledDate:  assignmentsTable.scheduledDate,
        requiredRegion: assignmentsTable.requiredRegion,
      })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId))
      .limit(1),
  ]);

  const assignedMap    = new Map(assignedRows.map((r) => [r.personnelId, r.linkId]));
  const scheduledDate  = assignmentRow?.scheduledDate  ?? null;
  const assignmentRegion = assignmentRow?.requiredRegion ?? null;

  // ── Batch availability status ──────────────────────────────────────────────
  let availabilityMap: Record<string, AvailabilityStatus> = {};
  if (scheduledDate && personnelRows.length > 0) {
    availabilityMap = await getBatchAvailabilityStatus(
      personnelRows.map((p) => p.id),
      scheduledDate,
    );
  }

  const requiredRoleIds = [
    ...new Set(
      taskRows
        .map((r) => r.requiredRoleId)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];
  const requiredCertificates = [
    ...new Set(taskRows.flatMap((r) => (r.requiredCertificates as string[] | null) ?? [])),
  ];
  const requiredKnowledge = [
    ...new Set(taskRows.flatMap((r) => (r.requiredKnowledge as string[] | null) ?? [])),
  ];
  const requiredDiplomas = [
    ...new Set(
      taskRows
        .map((r) => r.requiredDiploma)
        .filter((d): d is string => d !== null && d !== undefined),
    ),
  ];

  return {
    requirements: {
      requiredRoleIds,
      requiredCertificates,
      requiredKnowledge,
      requiredDiplomas,
      assignmentRegion,
      scheduledDate,
    },
    personnel: personnelRows.map((r) => ({
      personnelId:        r.id,
      linkId:             assignedMap.get(r.id) ?? null,
      firstName:          r.firstName,
      lastName:           r.lastName,
      roleId:             r.roleId   ?? null,
      roleName:           r.roleName ?? null,
      region:             r.region   ?? null,
      certificates:       (r.certificates as string[] | null) ?? [],
      diplomas:           (r.diplomas    as string[] | null) ?? [],
      knowledge:          (r.knowledge   as string[] | null) ?? [],
      isActive:           r.isActive,
      availabilityStatus: (availabilityMap[r.id] ?? "niet_ingesteld") as AvailabilityStatus,
    })),
  };
}

/**
 * Remove a personnel member from an assignment by personnelId.
 * Reverts the assignment status back to 'plannable' if it was 'scheduled'.
 */
export async function unassignPersonnel(
  assignmentId: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [[link], [current]] = await Promise.all([
    db
      .select({ id: assignmentPersonnelTable.id })
      .from(assignmentPersonnelTable)
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentId),
          eq(assignmentPersonnelTable.personnelId,  personnelId),
        ),
      )
      .limit(1),
    db
      .select({ status: assignmentsTable.status })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId))
      .limit(1),
  ]);

  if (!link) return { success: false, message: "Koppeling niet gevonden." };

  await db
    .delete(assignmentPersonnelTable)
    .where(eq(assignmentPersonnelTable.id, link.id));

  if (current?.status === "scheduled") {
    await db
      .update(assignmentsTable)
      .set({ status: "plannable", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "unassign_personnel",
    resource:   "assignments",
    resourceId: assignmentId,
    metadata:   { personnelId },
  });

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}
