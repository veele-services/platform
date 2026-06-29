import {
  and,
  asc,
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
import {
  assignmentCandidatesTable,
  assignmentCapacityChecksTable,
  assignmentInterestResponsesTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  assignmentsTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  customersTable,
  db,
  leavePeriodsTable,
  objectPersonnelTable,
  objectsTable,
  personnelTable,
  planningSectorRulesTable,
  qualificationItemsTable,
  roleQualificationsTable,
  rolesTable,
  sectorsTable,
  taskCodesTable,
  type AssignmentCandidate,
  type AssignmentCapacityCheck,
  type SmartPlanningCandidateStatus,
  type SmartPlanningCapacityStatus,
  type SmartPlanningReason,
  type SmartPlanningScoreBreakdown,
  type SmartPlanningScoreWeights,
} from "./index";

export type SmartPlanningCandidateResult = {
  personnelId: string;
  firstName: string;
  lastName: string;
  roleName: string | null;
  sectorName: string | null;
  region: string | null;
  hardStatus: SmartPlanningCandidateStatus;
  eligible: boolean;
  available: boolean;
  hasConflict: boolean;
  matchScore: number;
  reasons: SmartPlanningReason[];
  positives: string[];
  negatives: string[];
  scoreBreakdown: Partial<SmartPlanningScoreBreakdown>;
};

export type SmartPlanningCapacityResult = {
  assignmentId: string;
  requiredSlots: number;
  suitableTotal: number;
  availableTotal: number;
  topMatchTotal: number;
  conflictTotal: number;
  interestedTotal: number;
  highestMatchScore: number;
  capacityStatus: SmartPlanningCapacityStatus;
  advice: string;
  generatedAt: Date;
  inputSnapshot: Record<string, unknown>;
  candidates: SmartPlanningCandidateResult[];
};

const DEFAULT_WEIGHTS: SmartPlanningScoreWeights = {
  availability: 25,
  role: 12,
  qualifications: 20,
  region: 15,
  objectExperience: 10,
  workload: 8,
  emergency: 4,
  fixedTeams: 3,
  preferences: 3,
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function certNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        const certificate = item as { name?: unknown; expires_at?: unknown; expiresAt?: unknown };
        const expiresAt = certificate.expires_at ?? certificate.expiresAt;
        if (typeof expiresAt === "string" && isExpiredDate(expiresAt)) return "";
        return String(certificate.name ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function isExpiredDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart < bEnd && aEnd > bStart;
}

function normalizeWeights(value: unknown): SmartPlanningScoreWeights {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<keyof SmartPlanningScoreWeights, unknown>>)
      : {};
  const weights = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(weights) as Array<keyof SmartPlanningScoreWeights>) {
    const next = Number(input[key]);
    if (Number.isFinite(next) && next >= 0) weights[key] = next;
  }

  const total = Object.values(weights).reduce((sum, next) => sum + next, 0);
  if (total <= 0) return DEFAULT_WEIGHTS;
  if (total === 100) return weights;

  const scaled = { ...weights };
  for (const key of Object.keys(scaled) as Array<keyof SmartPlanningScoreWeights>) {
    scaled[key] = Math.round((scaled[key] / total) * 100);
  }
  const delta = 100 - Object.values(scaled).reduce((sum, next) => sum + next, 0);
  scaled.availability += delta;
  return scaled;
}

function addReason(
  reasons: SmartPlanningReason[],
  code: string,
  label: string,
  severity: SmartPlanningReason["severity"],
) {
  reasons.push({ code, label, severity });
}

function weekRange(dateKey: string): { start: string; end: string } {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + deltaToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const format = (d: Date) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  return { start: format(start), end: format(end) };
}

function estimatedMinutesForRows(rows: Array<{ durationMinutes: number | null }>) {
  const total = rows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
  return total || 60;
}

function adviceFor(input: {
  status: SmartPlanningCapacityStatus;
  requiredSlots: number;
  availableTotal: number;
  interestedTotal: number;
}) {
  if (input.status === "green") {
    return `Capaciteit voldoende: ${input.availableTotal} medewerker(s) beschikbaar voor ${input.requiredSlots} benodigde plek(ken). Opdracht kan worden goedgekeurd en uitgezet.`;
  }
  if (input.status === "orange") {
    return `Capaciteit mogelijk voldoende: ${input.availableTotal} medewerker(s) beschikbaar en ${input.interestedTotal} interesse. Start of vervolg een interessepeiling voordat je definitief plant.`;
  }
  return `Capaciteit onvoldoende: ${input.requiredSlots} medewerker(s) nodig, ${input.availableTotal} beschikbaar. Activeer spoedpool, wijzig datum/tijd of benader flexpool.`;
}

export async function calculateAssignmentCapacity(
  assignmentId: string,
  options: { persist?: boolean; actorUserId?: string | null } = {},
): Promise<SmartPlanningCapacityResult | null> {
  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      requiredRegion: assignmentsTable.requiredRegion,
      requiredPersonnelCount: assignmentsTable.requiredPersonnelCount,
      customerId: assignmentsTable.customerId,
      customerName: customersTable.name,
      customerSectorId: customersTable.sectorId,
      objectId: assignmentsTable.objectId,
      objectName: objectsTable.name,
      objectCity: objectsTable.city,
      objectSectorId: objectsTable.sectorId,
    })
    .from(assignmentsTable)
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return null;

  const taskRows = await db
    .select({
      taskCodeId: assignmentTasksTable.taskCodeId,
      taskCode: taskCodesTable.code,
      taskCodeName: taskCodesTable.name,
      requiredRoleId: taskCodesTable.requiredRoleId,
      requiredRoleName: rolesTable.name,
      requiredCertificates: taskCodesTable.requiredCertificates,
      requiredDiploma: taskCodesTable.requiredDiploma,
      requiredKnowledge: taskCodesTable.requiredKnowledge,
      durationMinutes: taskCodesTable.durationMinutes,
      sectorId: taskCodesTable.sectorId,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .leftJoin(rolesTable, eq(taskCodesTable.requiredRoleId, rolesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const requiredRoleIds = uniqueStrings(taskRows.map((row) => row.requiredRoleId));
  const requiredRoleNames = uniqueStrings(taskRows.map((row) => row.requiredRoleName));
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
  const requiredCertificates = uniqueStrings(
    [
      ...taskRows.flatMap((row) => (row.requiredCertificates ?? []) as string[]),
      ...roleQualificationRows
        .filter((row) => row.type === "certificate")
        .map((row) => row.name),
    ],
  );
  const requiredDiplomas = uniqueStrings([
    ...taskRows.map((row) => row.requiredDiploma),
    ...roleQualificationRows
      .filter((row) => row.type === "diploma")
      .map((row) => row.name),
  ]);
  const requiredKnowledge = uniqueStrings(
    [
      ...taskRows.flatMap((row) => (row.requiredKnowledge ?? []) as string[]),
      ...roleQualificationRows
        .filter((row) => row.type === "knowledge")
        .map((row) => row.name),
    ],
  );
  const taskSectorIds = uniqueStrings(taskRows.map((row) => row.sectorId));
  const sectorId =
    assignment.objectSectorId ??
    assignment.customerSectorId ??
    taskSectorIds[0] ??
    null;
  const requiredSlots = Math.max(
    assignment.requiredPersonnelCount ?? 1,
    requiredRoleIds.length,
    1,
  );
  const estimatedDurationMinutes = estimatedMinutesForRows(taskRows);

  const [[sectorRule], personnelRows] = await Promise.all([
    db
      .select()
      .from(planningSectorRulesTable)
      .where(
        sectorId
          ? and(
              eq(planningSectorRulesTable.sectorId, sectorId),
              eq(planningSectorRulesTable.isActive, true),
            )
          : eq(planningSectorRulesTable.isActive, true),
      )
      .limit(1),
    db
      .select({
        id: personnelTable.id,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        roleId: personnelTable.roleId,
        roleName: rolesTable.name,
        sectorId: personnelTable.sectorId,
        sectorName: sectorsTable.name,
        region: personnelTable.region,
        preferredRegions: personnelTable.preferredRegions,
        certificates: personnelTable.certificates,
        diplomas: personnelTable.diplomas,
        knowledge: personnelTable.knowledge,
        isActive: personnelTable.isActive,
        isAvailable: personnelTable.isAvailable,
        emergencyAvailable: personnelTable.emergencyAvailable,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
      .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName)),
  ]);

  const weights = normalizeWeights(sectorRule?.weights);
  const topMatchThreshold = sectorRule?.topMatchThreshold ?? 85;
  const personnelIds = personnelRows.map((row) => row.id);
  const scheduledDate = assignment.scheduledDate;
  const hasFullMoment = Boolean(
    scheduledDate && assignment.scheduledStart && assignment.scheduledEnd,
  );
  const dayOfWeek = scheduledDate
    ? new Date(`${scheduledDate}T00:00:00`).getDay()
    : null;
  const week = scheduledDate ? weekRange(scheduledDate) : null;

  const [
    leaveRows,
    dayEntryRows,
    weeklyWindowRows,
    conflictRows,
    experienceRows,
    fixedTeamRows,
    workloadRows,
    activeInterestRows,
  ] = await Promise.all([
    scheduledDate && personnelIds.length > 0
      ? db
          .select({
            personnelId: leavePeriodsTable.personnelId,
            leaveType: leavePeriodsTable.leaveType,
          })
          .from(leavePeriodsTable)
          .where(
            and(
              inArray(leavePeriodsTable.personnelId, personnelIds),
              eq(leavePeriodsTable.status, "approved"),
              lte(leavePeriodsTable.startDate, scheduledDate),
              or(isNull(leavePeriodsTable.endDate), gte(leavePeriodsTable.endDate, scheduledDate)),
            ),
          )
      : Promise.resolve([] as Array<{ personnelId: string; leaveType: string }>),
    scheduledDate && personnelIds.length > 0
      ? db
          .select({
            personnelId: availabilityDayEntriesTable.personnelId,
            startTime: availabilityDayEntriesTable.startTime,
            endTime: availabilityDayEntriesTable.endTime,
            isEmergencyAvailable: availabilityDayEntriesTable.isEmergencyAvailable,
          })
          .from(availabilityDayEntriesTable)
          .where(
            and(
              inArray(availabilityDayEntriesTable.personnelId, personnelIds),
              eq(availabilityDayEntriesTable.date, scheduledDate),
            ),
          )
      : Promise.resolve(
          [] as Array<{
            personnelId: string;
            startTime: string;
            endTime: string;
            isEmergencyAvailable: boolean;
          }>,
        ),
    dayOfWeek !== null && personnelIds.length > 0
      ? db
          .select({
            personnelId: availabilityWindowsTable.personnelId,
            startTime: availabilityWindowsTable.startTime,
            endTime: availabilityWindowsTable.endTime,
          })
          .from(availabilityWindowsTable)
          .where(
            and(
              inArray(availabilityWindowsTable.personnelId, personnelIds),
              eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
            ),
          )
      : Promise.resolve(
          [] as Array<{ personnelId: string; startTime: string; endTime: string }>,
        ),
    scheduledDate && personnelIds.length > 0
      ? db
          .select({ personnelId: assignmentPersonnelTable.personnelId })
          .from(assignmentPersonnelTable)
          .innerJoin(
            assignmentsTable,
            eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              inArray(assignmentPersonnelTable.personnelId, personnelIds),
              eq(assignmentPersonnelTable.status, "assigned"),
              ne(assignmentPersonnelTable.assignmentId, assignmentId),
              eq(assignmentsTable.scheduledDate, scheduledDate),
              hasFullMoment
                ? sql<boolean>`${assignmentsTable.scheduledStart} < ${assignment.scheduledEnd} AND ${assignmentsTable.scheduledEnd} > ${assignment.scheduledStart}`
                : undefined,
            ),
          )
      : Promise.resolve([] as Array<{ personnelId: string }>),
    (assignment.objectId || assignment.customerId) && personnelIds.length > 0
      ? db
          .select({
            personnelId: assignmentPersonnelTable.personnelId,
            count: sql<number>`count(*)::int`,
          })
          .from(assignmentPersonnelTable)
          .innerJoin(
            assignmentsTable,
            eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              inArray(assignmentPersonnelTable.personnelId, personnelIds),
              eq(assignmentPersonnelTable.status, "assigned"),
              ne(assignmentsTable.id, assignmentId),
              or(
                assignment.objectId
                  ? eq(assignmentsTable.objectId, assignment.objectId)
                  : undefined,
                eq(assignmentsTable.customerId, assignment.customerId),
              ),
            ),
          )
          .groupBy(assignmentPersonnelTable.personnelId)
      : Promise.resolve([] as Array<{ personnelId: string; count: number }>),
    assignment.objectId && personnelIds.length > 0
      ? db
          .select({ personnelId: objectPersonnelTable.personnelId })
          .from(objectPersonnelTable)
          .where(
            and(
              eq(objectPersonnelTable.objectId, assignment.objectId),
              inArray(objectPersonnelTable.personnelId, personnelIds),
            ),
          )
      : Promise.resolve([] as Array<{ personnelId: string }>),
    week && personnelIds.length > 0
      ? db
          .select({
            personnelId: assignmentPersonnelTable.personnelId,
            minutes: sql<number>`coalesce(sum(
              case
                when ${assignmentsTable.scheduledStart} is not null
                 and ${assignmentsTable.scheduledEnd} is not null
                then greatest(
                  0,
                  (
                    split_part(${assignmentsTable.scheduledEnd}, ':', 1)::int * 60
                    + split_part(${assignmentsTable.scheduledEnd}, ':', 2)::int
                  ) -
                  (
                    split_part(${assignmentsTable.scheduledStart}, ':', 1)::int * 60
                    + split_part(${assignmentsTable.scheduledStart}, ':', 2)::int
                  )
                )
                else 60
              end
            ), 0)::int`,
          })
          .from(assignmentPersonnelTable)
          .innerJoin(
            assignmentsTable,
            eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              inArray(assignmentPersonnelTable.personnelId, personnelIds),
              eq(assignmentPersonnelTable.status, "assigned"),
              gte(assignmentsTable.scheduledDate, week.start),
              lte(assignmentsTable.scheduledDate, week.end),
            ),
          )
          .groupBy(assignmentPersonnelTable.personnelId)
      : Promise.resolve([] as Array<{ personnelId: string; minutes: number }>),
    db
      .select({
        personnelId: assignmentInterestResponsesTable.personnelId,
        status: assignmentInterestResponsesTable.status,
      })
      .from(assignmentInterestResponsesTable)
      .where(
        and(
          eq(assignmentInterestResponsesTable.assignmentId, assignmentId),
          inArray(assignmentInterestResponsesTable.status, [
            "interested",
            "selected",
            "reserve",
            "confirmed",
          ]),
        ),
      ),
  ]);

  const leaveByPersonnel = new Map(leaveRows.map((row) => [row.personnelId, row.leaveType]));
  const dayEntryByPersonnel = new Map(dayEntryRows.map((row) => [row.personnelId, row]));
  const weeklyWindowByPersonnel = new Map(
    weeklyWindowRows.map((row) => [row.personnelId, row]),
  );
  const conflictSet = new Set(conflictRows.map((row) => row.personnelId));
  const experienceMap = new Map(
    experienceRows.map((row) => [row.personnelId, row.count ?? 0]),
  );
  const fixedTeamSet = new Set(fixedTeamRows.map((row) => row.personnelId));
  const workloadMap = new Map(
    workloadRows.map((row) => [row.personnelId, row.minutes ?? 0]),
  );
  const candidates: SmartPlanningCandidateResult[] = personnelRows.map((person) => {
    const reasons: SmartPlanningReason[] = [];
    const positives: string[] = [];
    const negatives: string[] = [];
    const personCertificates = certNames(person.certificates);
    const personDiplomas = stringArray(person.diplomas);
    const personKnowledge = stringArray(person.knowledge);
    const preferredRegions = stringArray(person.preferredRegions);
    const leaveType = leaveByPersonnel.get(person.id) ?? null;
    const dayEntry = dayEntryByPersonnel.get(person.id) ?? null;
    const weeklyWindow = weeklyWindowByPersonnel.get(person.id) ?? null;
    const activeWindow = dayEntry ?? weeklyWindow ?? null;

    if (!person.isActive) {
      addReason(reasons, "inactive", "Medewerker is inactief", "block");
      negatives.push("Inactief");
    }
    if (!person.isAvailable) {
      addReason(
        reasons,
        "not_available_for_planning",
        "Niet beschikbaar voor planning",
        "block",
      );
      negatives.push("Niet beschikbaar voor planning");
    }
    if (leaveType === "ziekte") {
      addReason(reasons, "sick", "Ziek gemeld", "block");
      negatives.push("Ziek gemeld");
    } else if (leaveType) {
      addReason(reasons, "on_leave", "Op verlof", "block");
      negatives.push("Op verlof");
    }

    const hasRequiredMoment = Boolean(
      scheduledDate && assignment.scheduledStart && assignment.scheduledEnd,
    );
    let availabilityPass = false;
    if (!scheduledDate || !assignment.scheduledStart || !assignment.scheduledEnd) {
      addReason(
        reasons,
        "missing_moment",
        "Datum of tijdvak ontbreekt voor harde beschikbaarheidscheck",
        "warning",
      );
      negatives.push("Moment ontbreekt");
    } else if (!activeWindow) {
      addReason(
        reasons,
        "unavailable",
        "Geen beschikbaarheid voor dit tijdvak",
        "block",
      );
      negatives.push("Niet beschikbaar in tijdvak");
    } else if (
      timeToMinutes(activeWindow.startTime) <= timeToMinutes(assignment.scheduledStart) &&
      timeToMinutes(activeWindow.endTime) >= timeToMinutes(assignment.scheduledEnd)
    ) {
      availabilityPass = true;
      addReason(reasons, "available", "Beschikbaar in het volledige tijdvak", "ok");
      positives.push("Beschikbaar");
    } else {
      addReason(
        reasons,
        "outside_availability_window",
        "Beschikbaarheidsvenster dekt opdrachttijd niet",
        "block",
      );
      negatives.push("Beschikbaarheid dekt tijdvak niet");
    }

    const hasConflict = conflictSet.has(person.id);
    if (hasConflict) {
      addReason(reasons, "already_booked", "Al ingepland op dit tijdstip", "block");
      negatives.push("Conflict met bestaande planning");
    }

    if (requiredRoleIds.length > 0 && !requiredRoleIds.includes(person.roleId ?? "")) {
      addReason(reasons, "role_mismatch", "Benodigde functie/rol ontbreekt", "block");
      negatives.push("Rol/functie ontbreekt");
    } else if (requiredRoleIds.length > 0) {
      positives.push("Juiste functie");
    }

    if (sectorId && person.sectorId !== sectorId) {
      addReason(reasons, "sector_mismatch", "Sector komt niet overeen", "block");
      negatives.push("Sector mismatch");
    } else if (sectorId) {
      positives.push("Juiste sector");
    }

    const missingCertificates = requiredCertificates.filter(
      (cert) => !personCertificates.includes(cert),
    );
    if (missingCertificates.length > 0) {
      addReason(
        reasons,
        "certificate_missing",
        `Certificaat ontbreekt: ${missingCertificates.join(", ")}`,
        "block",
      );
      negatives.push("Certificaat ontbreekt");
    } else if (requiredCertificates.length > 0) {
      positives.push("Certificaten geldig");
    }

    const missingDiplomas = requiredDiplomas.filter(
      (diploma) => !personDiplomas.includes(diploma),
    );
    if (missingDiplomas.length > 0) {
      addReason(
        reasons,
        "diploma_missing",
        `Diploma ontbreekt: ${missingDiplomas.join(", ")}`,
        "block",
      );
      negatives.push("Diploma ontbreekt");
    } else if (requiredDiplomas.length > 0) {
      positives.push("Diploma match");
    }

    const missingKnowledge = requiredKnowledge.filter(
      (knowledge) => !personKnowledge.includes(knowledge),
    );
    if (missingKnowledge.length > 0) {
      addReason(
        reasons,
        "knowledge_missing",
        `Kennis ontbreekt: ${missingKnowledge.join(", ")}`,
        "block",
      );
      negatives.push("Kennis ontbreekt");
    } else if (requiredKnowledge.length > 0) {
      positives.push("Kennis match");
    }

    const requiredRegion = assignment.requiredRegion?.trim().toLowerCase() || null;
    const candidateRegions = uniqueStrings([person.region, ...preferredRegions]).map((region) =>
      region.trim().toLowerCase(),
    );
    const regionPass = !requiredRegion || candidateRegions.includes(requiredRegion);
    if (!regionPass) {
      addReason(reasons, "region_mismatch", "Regio komt niet overeen", "block");
      negatives.push("Regio mismatch");
    } else if (requiredRegion) {
      positives.push("Regio match");
    }

    const blockReasons = reasons.filter((reason) => reason.severity === "block");
    const warningReasons = reasons.filter((reason) => reason.severity === "warning");
    const eligible = blockReasons.length === 0;
    const hardStatus: SmartPlanningCandidateStatus = eligible
      ? warningReasons.length > 0
        ? "warning"
        : "eligible"
      : "blocked";

    const experienceCount = experienceMap.get(person.id) ?? 0;
    const isFixedTeamMember = fixedTeamSet.has(person.id);
    const workloadMinutes = workloadMap.get(person.id) ?? 0;
    if (isFixedTeamMember) {
      addReason(reasons, "fixed_object_team", "Vast of voorkeurslid voor dit object", "ok");
      positives.push("Vast team voor dit object");
    } else if (experienceCount > 0) {
      positives.push("Eerder op deze klant/object gewerkt");
    }
    if (workloadMinutes > 36 * 60) negatives.push("Heeft deze week al veel uren");
    if (dayEntry?.isEmergencyAvailable || person.emergencyAvailable) {
      positives.push("Spoedbeschikbaar");
    }

    const rolePass =
      requiredRoleIds.length === 0 || requiredRoleIds.includes(person.roleId ?? "");
    const qualificationsPass =
      missingCertificates.length === 0 &&
      missingDiplomas.length === 0 &&
      missingKnowledge.length === 0;
    const workloadFactor = workloadMinutes <= 32 * 60 ? 1 : workloadMinutes <= 40 * 60 ? 0.55 : 0.15;
    const breakdown: Partial<SmartPlanningScoreBreakdown> = {
      availability: {
        weight: weights.availability,
        awarded: availabilityPass ? weights.availability : 0,
        label: availabilityPass ? "Beschikbaar" : "Niet volledig beschikbaar",
      },
      role: {
        weight: weights.role,
        awarded: rolePass ? weights.role : 0,
        label: requiredRoleIds.length === 0
          ? "Geen specifieke functie vereist"
          : rolePass
            ? "Juiste functie"
            : "Functie/rol ontbreekt",
      },
      qualifications: {
        weight: weights.qualifications,
        awarded: qualificationsPass ? weights.qualifications : 0,
        label:
          requiredCertificates.length + requiredDiplomas.length + requiredKnowledge.length === 0
            ? "Geen extra kwalificaties vereist"
            : qualificationsPass
              ? "Certificaten/diploma's/kennis matchen"
              : "Vereiste kwalificaties ontbreken",
      },
      region: {
        weight: weights.region,
        awarded: regionPass ? weights.region : 0,
        label: regionPass ? "Regio match" : "Regio mismatch",
      },
      objectExperience: {
        weight: weights.objectExperience,
        awarded: experienceCount > 0
          ? weights.objectExperience
          : Math.round(weights.objectExperience * 0.35),
        label: experienceCount > 0
            ? "Bekend met klant/object"
            : "Geen eerdere objectervaring",
      },
      workload: {
        weight: weights.workload,
        awarded: Math.round(weights.workload * workloadFactor),
        label: `${Math.round((workloadMinutes / 60) * 10) / 10} uur deze week`,
      },
      emergency: {
        weight: weights.emergency,
        awarded: dayEntry?.isEmergencyAvailable || person.emergencyAvailable ? weights.emergency : 0,
        label: dayEntry?.isEmergencyAvailable || person.emergencyAvailable ? "Spoedbeschikbaar" : "Geen spoedstatus",
      },
      fixedTeams: {
        weight: weights.fixedTeams,
        awarded: isFixedTeamMember ? weights.fixedTeams : 0,
        label: isFixedTeamMember ? "Vast team voor object" : "Geen vast team",
      },
      preferences: {
        weight: weights.preferences,
        awarded:
          requiredRegion && preferredRegions.map((r) => r.toLowerCase()).includes(requiredRegion)
            ? weights.preferences
            : Math.round(weights.preferences * 0.5),
        label:
          requiredRegion && preferredRegions.map((r) => r.toLowerCase()).includes(requiredRegion)
            ? "Voorkeursregio match"
            : "Voorkeuren deels passend",
      },
    };

    const rawScore = Object.values(breakdown).reduce(
      (sum, item) => sum + (item?.awarded ?? 0),
      0,
    );
    const matchScore = eligible ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;

    return {
      personnelId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      roleName: person.roleName ?? null,
      sectorName: person.sectorName ?? null,
      region: person.region ?? null,
      hardStatus,
      eligible,
      available: hasRequiredMoment && eligible && availabilityPass && !hasConflict,
      hasConflict,
      matchScore,
      reasons,
      positives,
      negatives,
      scoreBreakdown: breakdown,
    };
  });

  const suitableTotal = candidates.filter((candidate) => {
    const staticBlocks = candidate.reasons.filter((reason) =>
      [
        "inactive",
        "not_available_for_planning",
        "role_mismatch",
        "sector_mismatch",
        "certificate_missing",
        "diploma_missing",
        "knowledge_missing",
        "region_mismatch",
      ].includes(reason.code),
    );
    return staticBlocks.length === 0;
  }).length;
  const availableTotal = candidates.filter((candidate) => candidate.available).length;
  const topMatchTotal = candidates.filter(
    (candidate) =>
      candidate.available &&
      candidate.hardStatus === "eligible" &&
      candidate.matchScore >= topMatchThreshold,
  ).length;
  const conflictTotal = candidates.filter((candidate) => candidate.hasConflict).length;
  const interestedTotal = new Set(activeInterestRows.map((row) => row.personnelId)).size;
  const highestMatchScore = Math.max(0, ...candidates.map((candidate) => candidate.matchScore));
  const capacityStatus: SmartPlanningCapacityStatus =
    availableTotal >= requiredSlots && topMatchTotal >= requiredSlots
      ? "green"
      : availableTotal + interestedTotal >= requiredSlots && availableTotal > 0
        ? "orange"
        : "red";
  const advice = adviceFor({
    status: capacityStatus,
    requiredSlots,
    availableTotal,
    interestedTotal,
  });
  const generatedAt = new Date();
  const inputSnapshot = {
    assignment: {
      id: assignment.id,
      code: assignment.code,
      title: assignment.title,
      priority: assignment.priority,
      scheduledDate: assignment.scheduledDate,
      scheduledStart: assignment.scheduledStart,
      scheduledEnd: assignment.scheduledEnd,
      requiredRegion: assignment.requiredRegion,
      requiredPersonnelCount: assignment.requiredPersonnelCount,
    },
    customer: {
      id: assignment.customerId,
      name: assignment.customerName,
    },
    object: {
      id: assignment.objectId,
      name: assignment.objectName,
      city: assignment.objectCity,
    },
    requirements: {
      sectorId,
      requiredRoleIds,
      requiredRoleNames,
      requiredCertificates,
      requiredDiplomas,
      requiredKnowledge,
      taskCount: taskRows.length,
      estimatedDurationMinutes,
    },
  };

  const result: SmartPlanningCapacityResult = {
    assignmentId,
    requiredSlots,
    suitableTotal,
    availableTotal,
    topMatchTotal,
    conflictTotal,
    interestedTotal,
    highestMatchScore,
    capacityStatus,
    advice,
    generatedAt,
    inputSnapshot,
    candidates: candidates.sort((a, b) => {
      if (a.hardStatus !== b.hardStatus) {
        const order = { eligible: 0, warning: 1, blocked: 2 };
        return order[a.hardStatus] - order[b.hardStatus];
      }
      return b.matchScore - a.matchScore;
    }),
  };

  if (options.persist) {
    await persistAssignmentCapacity(result, {
      tenantId: assignment.tenantId,
      actorUserId: options.actorUserId ?? null,
    });
  }

  return result;
}

async function persistAssignmentCapacity(
  result: SmartPlanningCapacityResult,
  options: { tenantId: string; actorUserId: string | null },
) {
  await db.transaction(async (tx) => {
    await tx
      .update(assignmentCapacityChecksTable)
      .set({ isLatest: false })
      .where(eq(assignmentCapacityChecksTable.assignmentId, result.assignmentId));

    await tx.insert(assignmentCapacityChecksTable).values({
      tenantId: options.tenantId,
      assignmentId: result.assignmentId,
      requiredSlots: result.requiredSlots,
      suitableTotal: result.suitableTotal,
      availableTotal: result.availableTotal,
      topMatchTotal: result.topMatchTotal,
      conflictTotal: result.conflictTotal,
      interestedTotal: result.interestedTotal,
      highestMatchScore: result.highestMatchScore,
      capacityStatus: result.capacityStatus,
      advice: result.advice,
      inputSnapshot: result.inputSnapshot,
      summary: {
        candidates: result.candidates.length,
        topCandidates: result.candidates.slice(0, 5).map((candidate) => ({
          personnelId: candidate.personnelId,
          name: `${candidate.firstName} ${candidate.lastName}`.trim(),
          score: candidate.matchScore,
          hardStatus: candidate.hardStatus,
        })),
      },
      generatedBy: options.actorUserId,
      generatedAt: result.generatedAt,
      isLatest: true,
    });

    for (const candidate of result.candidates) {
      const values: typeof assignmentCandidatesTable.$inferInsert = {
        tenantId: options.tenantId,
        assignmentId: result.assignmentId,
        personnelId: candidate.personnelId,
        hardStatus: candidate.hardStatus,
        isEligible: candidate.eligible,
        isAvailable: candidate.available,
        hasConflict: candidate.hasConflict,
        matchScore: candidate.matchScore,
        reasons: candidate.reasons,
        scoreBreakdown: candidate.scoreBreakdown,
        lastCalculatedAt: result.generatedAt,
      };

      await tx
        .insert(assignmentCandidatesTable)
        .values(values)
        .onConflictDoUpdate({
          target: [
            assignmentCandidatesTable.assignmentId,
            assignmentCandidatesTable.personnelId,
          ],
          set: {
            hardStatus: values.hardStatus,
            isEligible: values.isEligible,
            isAvailable: values.isAvailable,
            hasConflict: values.hasConflict,
            matchScore: values.matchScore,
            reasons: values.reasons,
            scoreBreakdown: values.scoreBreakdown,
            lastCalculatedAt: values.lastCalculatedAt,
          },
        });
    }
  });
}

export async function getLatestAssignmentCapacity(
  assignmentId: string,
): Promise<{
  check: AssignmentCapacityCheck | null;
  candidates: AssignmentCandidate[];
}> {
  const [[check], candidates] = await Promise.all([
    db
      .select()
      .from(assignmentCapacityChecksTable)
      .where(
        and(
          eq(assignmentCapacityChecksTable.assignmentId, assignmentId),
          eq(assignmentCapacityChecksTable.isLatest, true),
        ),
      )
      .limit(1),
    db
      .select()
      .from(assignmentCandidatesTable)
      .where(eq(assignmentCandidatesTable.assignmentId, assignmentId))
      .orderBy(asc(assignmentCandidatesTable.hardStatus), desc(assignmentCandidatesTable.matchScore)),
  ]);

  return { check: check ?? null, candidates };
}

export async function getSmartPlanningRoundDefaults(
  assignmentId: string,
): Promise<{
  roundSize: number;
  expiresAt: Date;
  maxDailyInvites: number;
  reminderAfterMinutes: number;
  reminderDueAt: Date;
  inviteCooldownMinutes: number;
  allowEmergencyOverride: boolean;
}> {
  const [assignment] = await db
    .select({
      objectSectorId: objectsTable.sectorId,
      customerSectorId: customersTable.sectorId,
    })
    .from(assignmentsTable)
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  const sectorId = assignment?.objectSectorId ?? assignment?.customerSectorId ?? null;
  const [rule] = await db
    .select()
    .from(planningSectorRulesTable)
    .where(
      sectorId
        ? and(
            eq(planningSectorRulesTable.sectorId, sectorId),
            eq(planningSectorRulesTable.isActive, true),
          )
        : eq(planningSectorRulesTable.isActive, true),
    )
    .limit(1);

  const roundIntervalMinutes = rule?.roundIntervalMinutes ?? 30;
  const reminderAfterMinutes = rule?.reminderAfterMinutes ?? 15;
  const now = Date.now();
  const expiresAt = new Date(now + roundIntervalMinutes * 60_000);
  return {
    roundSize: rule?.defaultRoundSize ?? 5,
    expiresAt,
    maxDailyInvites: rule?.maxDailyInvites ?? 6,
    reminderAfterMinutes,
    reminderDueAt: new Date(now + reminderAfterMinutes * 60_000),
    inviteCooldownMinutes: rule?.inviteCooldownMinutes ?? 120,
    allowEmergencyOverride: rule?.allowEmergencyOverride ?? true,
  };
}
