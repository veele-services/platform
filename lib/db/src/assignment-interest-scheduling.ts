import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "./connection";
import {
  ASSIGNMENT_STATUS_TRANSITIONS,
  assignmentInterestResponsesTable,
  assignmentInterestRoundsTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  assignmentsTable,
  auditLogTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  customersTable,
  leavePeriodsTable,
  objectsTable,
  personnelTable,
  taskCodesTable,
  tenantTaskCodesTable,
  type AssignmentStatus,
  type SmartPlanningInterestResponseStatus,
} from "./schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InterestCandidateDecision = "selected" | "reserve" | "cancelled";

export type InterestSchedulingResult = {
  assignmentId: string;
  personnelId: string;
  tenantId: string;
  decision: InterestCandidateDecision;
  responseId: string;
  assignmentPersonnelId: string | null;
  assignmentStatus: AssignmentStatus;
  scheduled: boolean;
  assignedPersonnelIds: string[];
  assignedCount: number;
  requiredPersonnelCount: number;
  alreadyAssigned: boolean;
  notification: {
    eventKey: "assignment_assigned" | "assignment_interest_reserve" | null;
    title: string | null;
    body: string | null;
  };
};

const OPEN_ROUND_STATUSES = ["sent"] as const;
const INTEREST_ROUND_SOURCE_STATUSES: AssignmentStatus[] = [
  "requested",
  "review",
  "approved",
  "plannable",
];
const SELECTION_SOURCE_STATUSES: AssignmentStatus[] = [
  "requested",
  "review",
  "approved",
  "plannable",
  "scheduled",
];
const SELECTABLE_RESPONSE_STATUSES: SmartPlanningInterestResponseStatus[] = [
  "interested",
  "selected",
  "confirmed",
];
const RESERVABLE_RESPONSE_STATUSES: SmartPlanningInterestResponseStatus[] = [
  "interested",
  "selected",
  "reserve",
];
const CANCELLABLE_RESPONSE_STATUSES: SmartPlanningInterestResponseStatus[] = [
  "invited",
  "viewed",
  "interested",
  "selected",
  "reserve",
  "unavailable",
  "question",
];

function isLegalStatusTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function isValidDateKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidTimeKey(value: string | null): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function hasValidSchedulingMoment(input: {
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}): boolean {
  if (
    !isValidDateKey(input.scheduledDate) ||
    !isValidTimeKey(input.scheduledStart) ||
    !isValidTimeKey(input.scheduledEnd)
  ) {
    return false;
  }
  return timeToMinutes(input.scheduledEnd) > timeToMinutes(input.scheduledStart);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function certNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name?: unknown }).name ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function normalize(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase();
  return next ? next : null;
}

async function lockTenantAssignment(
  tx: DbTx,
  assignmentId: string,
  tenantId: string,
) {
  await tx.execute(sql`
    select id
    from assignments
    where id = ${assignmentId}
      and tenant_id = ${tenantId}
    for update
  `);

  const [assignment] = await tx
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
      requiredRegion: assignmentsTable.requiredRegion,
      requiredPersonnelCount: assignmentsTable.requiredPersonnelCount,
      customerId: assignmentsTable.customerId,
      objectId: assignmentsTable.objectId,
      customerSectorId: customersTable.sectorId,
      objectSectorId: objectsTable.sectorId,
    })
    .from(assignmentsTable)
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  return assignment
    ? {
        ...assignment,
        status: assignment.status as AssignmentStatus,
      }
    : null;
}

async function transitionToPlannableIfNeeded(
  tx: DbTx,
  assignment: NonNullable<Awaited<ReturnType<typeof lockTenantAssignment>>>,
  actorUserId: string,
) {
  if (assignment.status === "plannable" || assignment.status === "scheduled") {
    return assignment.status;
  }
  if (!isLegalStatusTransition(assignment.status, "plannable")) {
    throw new Error("Deze opdrachtstatus kan niet worden klaargezet voor planning.");
  }

  const [updated] = await tx
    .update(assignmentsTable)
    .set({ status: "plannable", updatedAt: new Date() })
    .where(
      and(
        eq(assignmentsTable.id, assignment.id),
        eq(assignmentsTable.tenantId, assignment.tenantId),
        eq(assignmentsTable.status, assignment.status),
      ),
    )
    .returning({ id: assignmentsTable.id });
  if (!updated) throw new Error("Opdrachtstatus is gewijzigd. Probeer opnieuw.");

  await tx.insert(auditLogTable).values({
    tenantId: assignment.tenantId,
    userId: actorUserId,
    action: "status_change",
    resource: "assignments",
    resourceId: assignment.id,
    metadata: {
      from: assignment.status,
      to: "plannable",
      trigger: "interest_scheduling",
    },
  });

  assignment.status = "plannable";
  return assignment.status;
}

export async function prepareAssignmentForInterestRound(input: {
  assignmentId: string;
  tenantId: string;
  actorUserId: string;
}) {
  return db.transaction(async (tx) => {
    const assignment = await lockTenantAssignment(tx, input.assignmentId, input.tenantId);
    if (!assignment || !INTEREST_ROUND_SOURCE_STATUSES.includes(assignment.status)) {
      throw new Error("Opdracht niet gevonden of niet geschikt voor interessepeiling.");
    }
    if (!hasValidSchedulingMoment(assignment)) {
      throw new Error("Vul eerst een geldige datum en tijdvak in voordat je een interessepeiling verstuurt.");
    }

    await transitionToPlannableIfNeeded(tx, assignment, input.actorUserId);

    await tx
      .update(assignmentInterestRoundsTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(assignmentInterestRoundsTable.tenantId, input.tenantId),
          eq(assignmentInterestRoundsTable.assignmentId, input.assignmentId),
          inArray(assignmentInterestRoundsTable.status, [...OPEN_ROUND_STATUSES]),
        ),
      );

    return assignment;
  });
}

async function validateCandidateEligibility(
  tx: DbTx,
  input: {
    assignment: NonNullable<Awaited<ReturnType<typeof lockTenantAssignment>>>;
    personnel: {
      id: string;
      tenantId: string;
      roleId: string | null;
      sectorId: string | null;
      region: string | null;
      preferredRegions: unknown;
      certificates: unknown;
      diplomas: unknown;
      knowledge: unknown;
      isActive: boolean;
      isAvailable: boolean;
    };
  },
) {
  const { assignment, personnel } = input;
  if (personnel.tenantId !== assignment.tenantId || !personnel.isActive) {
    throw new Error("Medewerker niet gevonden binnen deze organisatie.");
  }
  if (!personnel.isAvailable) {
    throw new Error("Deze medewerker is niet beschikbaar voor planning.");
  }
  if (!hasValidSchedulingMoment(assignment)) {
    throw new Error("Opdracht heeft geen geldig planningsmoment.");
  }

  const scheduledDate = assignment.scheduledDate!;
  const scheduledStart = assignment.scheduledStart!;
  const scheduledEnd = assignment.scheduledEnd!;
  const dayOfWeek = new Date(`${scheduledDate}T00:00:00`).getDay();

  const [[leave], [dayEntry], [weeklyWindow], [overlap]] = await Promise.all([
    tx
      .select({ id: leavePeriodsTable.id, leaveType: leavePeriodsTable.leaveType })
      .from(leavePeriodsTable)
      .where(
        and(
          eq(leavePeriodsTable.personnelId, personnel.id),
          eq(leavePeriodsTable.status, "approved"),
          lte(leavePeriodsTable.startDate, scheduledDate),
          or(isNull(leavePeriodsTable.endDate), gte(leavePeriodsTable.endDate, scheduledDate)),
        ),
      )
      .limit(1),
    tx
      .select({
        startTime: availabilityDayEntriesTable.startTime,
        endTime: availabilityDayEntriesTable.endTime,
      })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, personnel.id),
          eq(availabilityDayEntriesTable.date, scheduledDate),
        ),
      )
      .limit(1),
    tx
      .select({
        startTime: availabilityWindowsTable.startTime,
        endTime: availabilityWindowsTable.endTime,
      })
      .from(availabilityWindowsTable)
      .where(
        and(
          eq(availabilityWindowsTable.personnelId, personnel.id),
          eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
        ),
      )
      .limit(1),
    tx
      .select({ id: assignmentPersonnelTable.id })
      .from(assignmentPersonnelTable)
      .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentPersonnelTable.personnelId, personnel.id),
          eq(assignmentPersonnelTable.status, "assigned"),
          eq(assignmentsTable.tenantId, assignment.tenantId),
          ne(assignmentPersonnelTable.assignmentId, assignment.id),
          eq(assignmentsTable.scheduledDate, scheduledDate),
          sql<boolean>`${assignmentsTable.scheduledStart} < ${scheduledEnd}
            and ${assignmentsTable.scheduledEnd} > ${scheduledStart}`,
        ),
      )
      .limit(1),
  ]);

  if (leave?.leaveType === "ziekte") {
    throw new Error("Deze medewerker is ziek gemeld op dit moment.");
  }
  if (leave) {
    throw new Error("Deze medewerker heeft verlof op dit moment.");
  }

  const activeWindow = dayEntry ?? weeklyWindow ?? null;
  if (
    !activeWindow ||
    timeToMinutes(activeWindow.startTime) > timeToMinutes(scheduledStart) ||
    timeToMinutes(activeWindow.endTime) < timeToMinutes(scheduledEnd)
  ) {
    throw new Error("Deze medewerker is niet beschikbaar in het volledige tijdvak.");
  }
  if (overlap) {
    throw new Error("Deze medewerker heeft al een overlappende opdracht.");
  }

  const taskRows = await tx
    .select({
      requiredRoleId: sql<string | null>`coalesce(${tenantTaskCodesTable.requiredRoleId}, ${taskCodesTable.requiredRoleId})`,
      requiredCertificates: sql<string[]>`coalesce(${tenantTaskCodesTable.requiredCertificates}, ${taskCodesTable.requiredCertificates}, '[]'::jsonb)`,
      requiredDiploma: sql<string | null>`coalesce(${tenantTaskCodesTable.requiredDiploma}, ${taskCodesTable.requiredDiploma})`,
      requiredKnowledge: sql<string[]>`coalesce(${tenantTaskCodesTable.requiredKnowledge}, ${taskCodesTable.requiredKnowledge}, '[]'::jsonb)`,
      sectorId: sql<string | null>`coalesce(${tenantTaskCodesTable.sectorId}, ${taskCodesTable.sectorId})`,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .leftJoin(tenantTaskCodesTable, eq(assignmentTasksTable.tenantTaskCodeId, tenantTaskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, assignment.id));

  const requiredRoleIds = new Set(taskRows.map((row) => row.requiredRoleId).filter(Boolean));
  if (requiredRoleIds.size > 0 && !requiredRoleIds.has(personnel.roleId)) {
    throw new Error("Deze medewerker mist de vereiste rol voor deze opdracht.");
  }

  const personCertificates = certNames(personnel.certificates);
  const personDiplomas = stringArray(personnel.diplomas);
  const personKnowledge = stringArray(personnel.knowledge);
  const requiredCertificates = taskRows.flatMap((row) => stringArray(row.requiredCertificates));
  const requiredDiplomas = taskRows.map((row) => row.requiredDiploma).filter(Boolean) as string[];
  const requiredKnowledge = taskRows.flatMap((row) => stringArray(row.requiredKnowledge));
  if (requiredCertificates.some((item) => !personCertificates.includes(item))) {
    throw new Error("Deze medewerker mist een vereist certificaat.");
  }
  if (requiredDiplomas.some((item) => !personDiplomas.includes(item))) {
    throw new Error("Deze medewerker mist een vereist diploma.");
  }
  if (requiredKnowledge.some((item) => !personKnowledge.includes(item))) {
    throw new Error("Deze medewerker mist vereiste kennis.");
  }

  const sectorId =
    assignment.objectSectorId ??
    assignment.customerSectorId ??
    taskRows.map((row) => row.sectorId).find(Boolean) ??
    null;
  if (sectorId && personnel.sectorId !== sectorId) {
    throw new Error("Deze medewerker hoort niet bij de vereiste sector.");
  }

  const requiredRegion = normalize(assignment.requiredRegion);
  const candidateRegions = [personnel.region, ...stringArray(personnel.preferredRegions)]
    .map(normalize)
    .filter(Boolean);
  if (requiredRegion && !candidateRegions.includes(requiredRegion)) {
    throw new Error("Deze medewerker valt buiten de vereiste regio.");
  }
}

async function countAssigned(tx: DbTx, assignmentId: string, tenantId: string) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    );
  return row?.count ?? 0;
}

async function listAssignedPersonnelIds(tx: DbTx, assignmentId: string, tenantId: string) {
  const rows = await tx
    .select({ personnelId: assignmentPersonnelTable.personnelId })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    );
  return rows.map((row) => row.personnelId);
}

export async function selectInterestCandidateForScheduling(input: {
  assignmentId: string;
  personnelId: string;
  tenantId: string;
  actorUserId: string;
  decision: InterestCandidateDecision;
}): Promise<InterestSchedulingResult> {
  return db.transaction(async (tx) => {
    const assignment = await lockTenantAssignment(tx, input.assignmentId, input.tenantId);
    if (!assignment || !SELECTION_SOURCE_STATUSES.includes(assignment.status)) {
      throw new Error("Opdracht niet gevonden of niet geschikt voor planning.");
    }
    if (!hasValidSchedulingMoment(assignment)) {
      throw new Error("Opdracht heeft geen geldig planningsmoment.");
    }

    const [personnel] = await tx
      .select({
        id: personnelTable.id,
        tenantId: personnelTable.tenantId,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        roleId: personnelTable.roleId,
        sectorId: personnelTable.sectorId,
        region: personnelTable.region,
        preferredRegions: personnelTable.preferredRegions,
        certificates: personnelTable.certificates,
        diplomas: personnelTable.diplomas,
        knowledge: personnelTable.knowledge,
        isActive: personnelTable.isActive,
        isAvailable: personnelTable.isAvailable,
      })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.id, input.personnelId),
          eq(personnelTable.tenantId, input.tenantId),
          eq(personnelTable.isActive, true),
        ),
      )
      .limit(1);
    if (!personnel) {
      throw new Error("Medewerker niet gevonden binnen deze organisatie.");
    }

    const [response] = await tx
      .select({
        id: assignmentInterestResponsesTable.id,
        status: assignmentInterestResponsesTable.status,
        expiresAt: assignmentInterestResponsesTable.expiresAt,
        roundStatus: assignmentInterestRoundsTable.status,
      })
      .from(assignmentInterestResponsesTable)
      .innerJoin(
        assignmentInterestRoundsTable,
        eq(assignmentInterestResponsesTable.roundId, assignmentInterestRoundsTable.id),
      )
      .where(
        and(
          eq(assignmentInterestResponsesTable.tenantId, input.tenantId),
          eq(assignmentInterestResponsesTable.assignmentId, input.assignmentId),
          eq(assignmentInterestResponsesTable.personnelId, input.personnelId),
          eq(assignmentInterestRoundsTable.tenantId, input.tenantId),
          eq(assignmentInterestRoundsTable.assignmentId, input.assignmentId),
        ),
      )
      .orderBy(desc(assignmentInterestResponsesTable.createdAt))
      .limit(1);
    if (!response) {
      throw new Error("Deze medewerker heeft geen geldige interesse-uitnodiging voor deze opdracht.");
    }
    const now = new Date();
    if (response.roundStatus !== "sent" || (response.expiresAt && response.expiresAt < now)) {
      throw new Error("Deze interesse-uitnodiging is verlopen of geannuleerd.");
    }

    const [existingLink] = await tx
      .select({
        id: assignmentPersonnelTable.id,
        status: assignmentPersonnelTable.status,
      })
      .from(assignmentPersonnelTable)
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, input.assignmentId),
          eq(assignmentPersonnelTable.personnelId, input.personnelId),
        ),
      )
      .limit(1);

    if (input.decision === "cancelled") {
      if (existingLink?.status === "assigned" || response.status === "confirmed") {
        throw new Error("Een bevestigde medewerker moet via de ontkoppel-flow worden verwijderd.");
      }
      if (!CANCELLABLE_RESPONSE_STATUSES.includes(response.status)) {
        throw new Error("Deze reactie kan niet worden geannuleerd.");
      }
      const [updated] = await tx
        .update(assignmentInterestResponsesTable)
        .set({ status: "cancelled", selectedAt: null, updatedAt: now })
        .where(
          and(
            eq(assignmentInterestResponsesTable.id, response.id),
            eq(assignmentInterestResponsesTable.tenantId, input.tenantId),
          ),
        )
        .returning({ id: assignmentInterestResponsesTable.id });
      if (!updated) throw new Error("Reactie kon niet worden bijgewerkt.");

      await tx.insert(auditLogTable).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "assignment_interest_cancelled",
        resource: "assignments",
        resourceId: input.assignmentId,
        metadata: { personnelId: input.personnelId, responseId: response.id },
      });

      return {
        assignmentId: input.assignmentId,
        personnelId: input.personnelId,
        tenantId: input.tenantId,
        decision: input.decision,
        responseId: response.id,
        assignmentPersonnelId: null,
        assignmentStatus: assignment.status,
        scheduled: false,
        assignedPersonnelIds: await listAssignedPersonnelIds(tx, input.assignmentId, input.tenantId),
        assignedCount: await countAssigned(tx, input.assignmentId, input.tenantId),
        requiredPersonnelCount: assignment.requiredPersonnelCount,
        alreadyAssigned: false,
        notification: { eventKey: null, title: null, body: null },
      };
    }

    if (input.decision === "reserve") {
      if (!RESERVABLE_RESPONSE_STATUSES.includes(response.status)) {
        throw new Error("Alleen geinteresseerde kandidaten kunnen reserve worden gezet.");
      }
      const [updated] = await tx
        .update(assignmentInterestResponsesTable)
        .set({ status: "reserve", selectedAt: now, updatedAt: now })
        .where(
          and(
            eq(assignmentInterestResponsesTable.id, response.id),
            eq(assignmentInterestResponsesTable.tenantId, input.tenantId),
          ),
        )
        .returning({ id: assignmentInterestResponsesTable.id });
      if (!updated) throw new Error("Reactie kon niet worden bijgewerkt.");

      await tx.insert(auditLogTable).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "assignment_interest_reserve",
        resource: "assignments",
        resourceId: input.assignmentId,
        metadata: { personnelId: input.personnelId, responseId: response.id },
      });

      return {
        assignmentId: input.assignmentId,
        personnelId: input.personnelId,
        tenantId: input.tenantId,
        decision: input.decision,
        responseId: response.id,
        assignmentPersonnelId: null,
        assignmentStatus: assignment.status,
        scheduled: false,
        assignedPersonnelIds: await listAssignedPersonnelIds(tx, input.assignmentId, input.tenantId),
        assignedCount: await countAssigned(tx, input.assignmentId, input.tenantId),
        requiredPersonnelCount: assignment.requiredPersonnelCount,
        alreadyAssigned: false,
        notification: {
          eventKey: "assignment_interest_reserve",
          title: `Reserve voor ${assignment.code}`,
          body: "Je staat als reserve voor deze opdracht.",
        },
      };
    }

    if (!SELECTABLE_RESPONSE_STATUSES.includes(response.status)) {
      throw new Error("Alleen geinteresseerde of bevestigde kandidaten kunnen worden ingepland.");
    }

    await transitionToPlannableIfNeeded(tx, assignment, input.actorUserId);
    await validateCandidateEligibility(tx, { assignment, personnel });

    const alreadyAssigned = existingLink?.status === "assigned";
    const assignedBefore = await countAssigned(tx, input.assignmentId, input.tenantId);
    if (!alreadyAssigned && assignedBefore >= assignment.requiredPersonnelCount) {
      throw new Error("Alle vereiste plekken zijn al gevuld.");
    }

    const [link] = await tx
      .insert(assignmentPersonnelTable)
      .values({
        assignmentId: input.assignmentId,
        personnelId: input.personnelId,
        status: "assigned",
        assignedAt: now,
        assignedBy: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          assignmentPersonnelTable.assignmentId,
          assignmentPersonnelTable.personnelId,
        ],
        set: {
          status: "assigned",
          assignedAt: now,
          assignedBy: input.actorUserId,
        },
      })
      .returning({ id: assignmentPersonnelTable.id });
    if (!link) throw new Error("Medewerker kon niet worden ingepland.");

    const [confirmed] = await tx
      .update(assignmentInterestResponsesTable)
      .set({ status: "confirmed", selectedAt: now, updatedAt: now })
      .where(
        and(
          eq(assignmentInterestResponsesTable.id, response.id),
          eq(assignmentInterestResponsesTable.tenantId, input.tenantId),
        ),
      )
      .returning({ id: assignmentInterestResponsesTable.id });
    if (!confirmed) throw new Error("Reactie kon niet worden bevestigd.");

    let assignmentStatus = assignment.status;
    let scheduled = false;
    const assignedAfter = await countAssigned(tx, input.assignmentId, input.tenantId);
    if (
      assignedAfter >= assignment.requiredPersonnelCount &&
      assignment.status === "plannable" &&
      hasValidSchedulingMoment(assignment)
    ) {
      const [updatedAssignment] = await tx
        .update(assignmentsTable)
        .set({ status: "scheduled", updatedAt: now })
        .where(
          and(
            eq(assignmentsTable.id, input.assignmentId),
            eq(assignmentsTable.tenantId, input.tenantId),
            eq(assignmentsTable.status, "plannable"),
          ),
        )
        .returning({ id: assignmentsTable.id });
      if (!updatedAssignment) {
        throw new Error("Opdrachtstatus is gewijzigd. Probeer opnieuw.");
      }
      assignmentStatus = "scheduled";
      scheduled = true;

      await tx
        .update(assignmentInterestResponsesTable)
        .set({ status: "reserve", selectedAt: now, updatedAt: now })
        .where(
          and(
            eq(assignmentInterestResponsesTable.tenantId, input.tenantId),
            eq(assignmentInterestResponsesTable.assignmentId, input.assignmentId),
            ne(assignmentInterestResponsesTable.personnelId, input.personnelId),
            inArray(assignmentInterestResponsesTable.status, ["interested", "selected"]),
          ),
        );

      await tx
        .update(assignmentInterestRoundsTable)
        .set({ status: "expired" })
        .where(
          and(
            eq(assignmentInterestRoundsTable.tenantId, input.tenantId),
            eq(assignmentInterestRoundsTable.assignmentId, input.assignmentId),
            inArray(assignmentInterestRoundsTable.status, [...OPEN_ROUND_STATUSES]),
          ),
        );

      await tx.insert(auditLogTable).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "status_change",
        resource: "assignments",
        resourceId: input.assignmentId,
        metadata: {
          from: "plannable",
          to: "scheduled",
          trigger: "interest_slots_filled",
          assignedCount: assignedAfter,
          requiredPersonnelCount: assignment.requiredPersonnelCount,
        },
      });
    }

    const assignedPersonnelIds = await listAssignedPersonnelIds(tx, input.assignmentId, input.tenantId);
    await tx.insert(auditLogTable).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "assignment_interest_confirmed",
      resource: "assignments",
      resourceId: input.assignmentId,
      metadata: {
        personnelId: input.personnelId,
        responseId: response.id,
        assignmentPersonnelId: link.id,
        previousResponseStatus: response.status,
        previousLinkStatus: existingLink?.status ?? null,
        assignedCount: assignedAfter,
        requiredPersonnelCount: assignment.requiredPersonnelCount,
        scheduled,
      },
    });

    return {
      assignmentId: input.assignmentId,
      personnelId: input.personnelId,
      tenantId: input.tenantId,
      decision: input.decision,
      responseId: response.id,
      assignmentPersonnelId: link.id,
      assignmentStatus,
      scheduled,
      assignedPersonnelIds,
      assignedCount: assignedAfter,
      requiredPersonnelCount: assignment.requiredPersonnelCount,
      alreadyAssigned,
      notification: {
        eventKey: "assignment_assigned",
        title: `Werkbon ${assignment.code} ingepland`,
        body: `Je bent ingepland op ${assignment.scheduledDate} van ${assignment.scheduledStart} tot ${assignment.scheduledEnd}.`,
      },
    };
  });
}
