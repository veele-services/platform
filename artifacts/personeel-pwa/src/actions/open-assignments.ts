"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentInterestResponsesTable,
  assignmentTasksTable,
  taskCodesTable,
  personnelTable,
  objectsTable,
  qualificationItemsTable,
  roleQualificationsTable,
} from "@workspace/db";
import { desc, eq, and, inArray, or, gte, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Personnel profile helper ──────────────────────────────────────────────────

type CertificateEntry = {
  name:       string;
  expires_at?: string;
};

type PersonnelProfile = {
  id:           string;
  roleId:       string | null;
  region:       string | null;
  certificates: CertificateEntry[];
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
  code:             string;
  title:            string;
  scheduledDate:    string | null;
  scheduledStart:   string | null;
  scheduledEnd:     string | null;
  workflowStatus:   string;
  priority:         string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  requiredRegion:   string | null;
  taskCodes:        string[];
  isAlreadyApplied: boolean;
  interestStatus:   string | null;
  isInterestInvite: boolean;
};

// ─── Eligibility helpers ──────────────────────────────────────────────────────

type TaskRequirements = {
  requiredRoleId:       string | null;
  requiredCertificates: string[];
  requiredDiploma:      string | null;
  requiredKnowledge:    string[];
};

function isExpiredDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
}

function hasValidCertificate(personnel: PersonnelProfile, name: string): boolean {
  return personnel.certificates.some(
    (certificate) =>
      certificate.name === name &&
      (!certificate.expires_at || !isExpiredDate(certificate.expires_at)),
  );
}

/**
 * Check whether a personnel member meets ALL requirements of a task code.
 * Mirrors the backoffice planning eligibility rules.
 */
function meetsTaskRequirements(
  personnel: PersonnelProfile,
  task: TaskRequirements,
): boolean {
  if (task.requiredRoleId && personnel.roleId !== task.requiredRoleId) return false;
  if (task.requiredCertificates.length > 0) {
    if (!task.requiredCertificates.every((c) => hasValidCertificate(personnel, c))) return false;
  }
  if (task.requiredDiploma) {
    if (!personnel.diplomas.includes(task.requiredDiploma)) return false;
  }
  if (task.requiredKnowledge.length > 0) {
    if (!task.requiredKnowledge.every((k) => personnel.knowledge.includes(k))) return false;
  }
  return true;
}

/**
 * Check region scope: if the personnel member has a region configured,
 * only show assignments whose object city contains that region (case-insensitive).
 * Assignments whose object city is null are shown to everyone.
 *
 * NOTE: assignments have no dedicated region column. City-based matching is
 * the best approximation without a DB migration. When a `region` column is
 * added to assignments (see task #82), replace this check.
 */
function meetsRegionScope(personnel: PersonnelProfile, objectCity: string | null): boolean {
  if (!personnel.region) return true; // no region set → no filter
  if (!objectCity) return true; // no object city → don't exclude
  return objectCity.toLowerCase().includes(personnel.region.toLowerCase());
}

function isEligibleForAssignment(
  personnel: PersonnelProfile,
  tasks: TaskRequirements[],
  objectCity: string | null,
): boolean {
  if (!meetsRegionScope(personnel, objectCity)) return false;
  if (tasks.length === 0) return true; // no task requirements → open to all
  return tasks.every((t) => meetsTaskRequirements(personnel, t));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * List plannable assignments that this personnel member is eligible for.
 *
 * Eligibility rules (parity with backoffice planning eligibility):
 *   - Region: if personnel has a region, only show assignments whose object
 *             city contains that region string (city-based approximation).
 *   - Role: if a task requires a role, personnel's roleId must match.
 *   - Certificates: personnel must hold all required certificates.
 *   - Diploma: personnel must hold the required diploma.
 *   - Knowledge: personnel must have all required knowledge tags.
 *
 * Uses @workspace/db (Drizzle / service-role connection) to bypass RLS so
 * that ALL plannable assignments are visible for the eligibility check.
 * No SELECT policy is granted to authenticated users — service-role bypasses RLS.
 */
export async function getOpenAssignments(): Promise<OpenAssignment[]> {
  const personnel = await getPersonnelProfile();
  if (!personnel) return [];

  const activeInterestStatuses = [
    "invited",
    "viewed",
    "interested",
    "unavailable",
    "question",
    "selected",
    "reserve",
    "confirmed",
  ] as const;
  const now = new Date();

  const interestRows = await db
    .select({
      id: assignmentInterestResponsesTable.id,
      assignmentId: assignmentInterestResponsesTable.assignmentId,
      status: assignmentInterestResponsesTable.status,
      createdAt: assignmentInterestResponsesTable.createdAt,
    })
    .from(assignmentInterestResponsesTable)
    .where(
      and(
        eq(assignmentInterestResponsesTable.personnelId, personnel.id),
        inArray(assignmentInterestResponsesTable.status, [...activeInterestStatuses]),
        or(
          isNull(assignmentInterestResponsesTable.expiresAt),
          gte(assignmentInterestResponsesTable.expiresAt, now),
        ),
      ),
    )
    .orderBy(desc(assignmentInterestResponsesTable.createdAt));

  const newlyViewedIds = interestRows
    .filter((row) => row.status === "invited")
    .map((row) => row.id);
  if (newlyViewedIds.length > 0) {
    await db
      .update(assignmentInterestResponsesTable)
      .set({ status: "viewed", viewedAt: now, updatedAt: now })
      .where(inArray(assignmentInterestResponsesTable.id, newlyViewedIds));
  }

  const interestByAssignment = new Map<string, string>();
  for (const row of interestRows) {
    if (!interestByAssignment.has(row.assignmentId)) {
      interestByAssignment.set(row.assignmentId, row.status === "invited" ? "viewed" : row.status);
    }
  }
  const invitedAssignmentIds = [...interestByAssignment.keys()];
  const statusScope =
    invitedAssignmentIds.length > 0
      ? or(
          eq(assignmentsTable.status, "plannable"),
          inArray(assignmentsTable.id, invitedAssignmentIds),
        )
      : eq(assignmentsTable.status, "plannable");

  const assignments = await db
    .select({
      id:             assignmentsTable.id,
      code:           assignmentsTable.code,
      title:          assignmentsTable.title,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      status:         assignmentsTable.status,
      priority:       assignmentsTable.priority,
      requiredRegion: assignmentsTable.requiredRegion,
      objectAddress:  objectsTable.address,
      objectCity:     objectsTable.city,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        statusScope,
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
  const requiredRoleIds = [
    ...new Set(
      taskRows
        .map((task) => task.requiredRoleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roleQualificationRows =
    requiredRoleIds.length > 0
      ? await db
          .select({
            roleId: roleQualificationsTable.roleId,
            type: qualificationItemsTable.type,
            name: qualificationItemsTable.name,
          })
          .from(roleQualificationsTable)
          .innerJoin(
            qualificationItemsTable,
            eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id),
          )
          .where(
            and(
              inArray(roleQualificationsTable.roleId, requiredRoleIds),
              eq(roleQualificationsTable.required, true),
              eq(qualificationItemsTable.isActive, true),
            ),
          )
      : [];

  // Group tasks by assignment — separate requirements from display names
  const reqsByAssignment  = new Map<string, TaskRequirements[]>();
  const namesByAssignment = new Map<string, string[]>();

  for (const t of taskRows) {
    if (!reqsByAssignment.has(t.assignmentId)) {
      reqsByAssignment.set(t.assignmentId, []);
      namesByAssignment.set(t.assignmentId, []);
    }
    const roleRequirements = roleQualificationRows.filter(
      (row) => row.roleId === t.requiredRoleId,
    );
    reqsByAssignment.get(t.assignmentId)!.push({
      requiredRoleId:       t.requiredRoleId ?? null,
      requiredCertificates: [
        ...((t.requiredCertificates as string[]) ?? []),
        ...roleRequirements
          .filter((row) => row.type === "certificate")
          .map((row) => row.name),
      ],
      requiredDiploma:
        t.requiredDiploma ??
        roleRequirements.find((row) => row.type === "diploma")?.name ??
        null,
      requiredKnowledge: [
        ...((t.requiredKnowledge as string[]) ?? []),
        ...roleRequirements
          .filter((row) => row.type === "knowledge")
          .map((row) => row.name),
      ],
    });
    if (t.taskCodeName) {
      namesByAssignment.get(t.assignmentId)!.push(t.taskCodeName);
    }
  }

  return assignments
    .filter((a) => {
      const reqs = reqsByAssignment.get(a.id) ?? [];
      return isEligibleForAssignment(personnel, reqs, a.objectCity ?? null);
    })
    .map((a) => ({
      id:               a.id,
      code:             a.code,
      title:            a.title,
      scheduledDate:    a.scheduledDate,
      scheduledStart:   a.scheduledStart,
      scheduledEnd:     a.scheduledEnd,
      workflowStatus:   a.status,
      priority:         a.priority ?? null,
      requiredRegion:   a.requiredRegion ?? null,
      objectAddress:    a.objectAddress ?? null,
      objectCity:       a.objectCity ?? null,
      taskCodes:        namesByAssignment.get(a.id) ?? [],
      isAlreadyApplied:
        myIds.has(a.id) ||
        ["interested", "selected", "reserve", "confirmed"].includes(
          interestByAssignment.get(a.id) ?? "",
        ),
      interestStatus:   interestByAssignment.get(a.id) ?? null,
      isInterestInvite: interestByAssignment.has(a.id),
    }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Apply for a plannable assignment.
 * Re-checks eligibility server-side before inserting assignment_personnel row
 * with status='suggested'. Requires migration 016 to be run first.
 */
export async function applyForAssignment(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const personnel = await getPersonnelProfile();
  if (!personnel) {
    return { success: false, error: "Niet ingelogd of personeelsprofiel niet gevonden" };
  }

  const [interestResponse] = await db
    .select({
      id: assignmentInterestResponsesTable.id,
      status: assignmentInterestResponsesTable.status,
    })
    .from(assignmentInterestResponsesTable)
    .where(
      and(
        eq(assignmentInterestResponsesTable.assignmentId, assignmentId),
        eq(assignmentInterestResponsesTable.personnelId, personnel.id),
      ),
    )
    .orderBy(desc(assignmentInterestResponsesTable.createdAt))
    .limit(1);

  const [assignment] = await db
    .select({
      id:          assignmentsTable.id,
      objectId:    assignmentsTable.objectId,
      objectCity:  objectsTable.city,
      status:      assignmentsTable.status,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!assignment || (!interestResponse && assignment.status !== "plannable")) {
    return { success: false, error: "Opdracht is niet meer beschikbaar" };
  }

  if (
    interestResponse &&
    ["interested", "selected", "reserve", "confirmed"].includes(interestResponse.status)
  ) {
    return { success: false, error: "U heeft al gereageerd op deze opdracht" };
  }

  // Fetch task requirements for this assignment
  const taskRows = await db
    .select({
      requiredRoleId:       taskCodesTable.requiredRoleId,
      requiredCertificates: taskCodesTable.requiredCertificates,
      requiredDiploma:      taskCodesTable.requiredDiploma,
      requiredKnowledge:    taskCodesTable.requiredKnowledge,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const applyRoleIds = [
    ...new Set(
      taskRows
        .map((task) => task.requiredRoleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const applyRoleQualificationRows =
    applyRoleIds.length > 0
      ? await db
          .select({
            roleId: roleQualificationsTable.roleId,
            type: qualificationItemsTable.type,
            name: qualificationItemsTable.name,
          })
          .from(roleQualificationsTable)
          .innerJoin(
            qualificationItemsTable,
            eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id),
          )
          .where(
            and(
              inArray(roleQualificationsTable.roleId, applyRoleIds),
              eq(roleQualificationsTable.required, true),
              eq(qualificationItemsTable.isActive, true),
            ),
          )
      : [];

  const requirements: TaskRequirements[] = taskRows.map((t) => {
    const roleRequirements = applyRoleQualificationRows.filter(
      (row) => row.roleId === t.requiredRoleId,
    );
    return {
      requiredRoleId:       t.requiredRoleId ?? null,
      requiredCertificates: [
        ...((t.requiredCertificates as string[]) ?? []),
        ...roleRequirements
          .filter((row) => row.type === "certificate")
          .map((row) => row.name),
      ],
      requiredDiploma:
        t.requiredDiploma ??
        roleRequirements.find((row) => row.type === "diploma")?.name ??
        null,
      requiredKnowledge: [
        ...((t.requiredKnowledge as string[]) ?? []),
        ...roleRequirements
          .filter((row) => row.type === "knowledge")
          .map((row) => row.name),
      ],
    };
  });

  // Server-side eligibility re-check (prevents direct action calls bypassing UI filters)
  if (!isEligibleForAssignment(personnel, requirements, assignment.objectCity ?? null)) {
    return { success: false, error: "U komt niet in aanmerking voor deze opdracht" };
  }

  if (interestResponse) {
    await db
      .update(assignmentInterestResponsesTable)
      .set({
        status: "interested",
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assignmentInterestResponsesTable.id, interestResponse.id));

    revalidatePath("/openstaand");
    revalidatePath("/opdrachten");
    return { success: true };
  }

  // Check for duplicate application
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

export async function declineAssignmentInterest(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const personnel = await getPersonnelProfile();
  if (!personnel) {
    return { success: false, error: "Niet ingelogd of personeelsprofiel niet gevonden" };
  }

  const [response] = await db
    .select({
      id: assignmentInterestResponsesTable.id,
      status: assignmentInterestResponsesTable.status,
    })
    .from(assignmentInterestResponsesTable)
    .where(
      and(
        eq(assignmentInterestResponsesTable.assignmentId, assignmentId),
        eq(assignmentInterestResponsesTable.personnelId, personnel.id),
      ),
    )
    .orderBy(desc(assignmentInterestResponsesTable.createdAt))
    .limit(1);

  if (!response) {
    return { success: false, error: "Geen uitnodiging gevonden voor deze opdracht" };
  }

  if (["selected", "reserve", "confirmed"].includes(response.status)) {
    return {
      success: false,
      error: "Deze uitnodiging is al door planning verwerkt.",
    };
  }

  await db
    .update(assignmentInterestResponsesTable)
    .set({
      status: "unavailable",
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assignmentInterestResponsesTable.id, response.id));

  revalidatePath("/openstaand");
  return { success: true };
}
