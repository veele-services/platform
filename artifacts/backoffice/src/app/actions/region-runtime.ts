"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  customersTable,
  objectsTable,
  personnelTable,
  rolesTable,
  sectorsTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { getBatchAvailabilityStatus } from "./availability";
import type { AvailabilityStatus } from "./availability";
import type { PersonnelRow } from "./personnel";
import type { ObjectRow } from "./objects";
import type { AssignmentPriority, AssignmentRow, AssignmentStatus } from "./assignments";
import { ASSIGNMENT_PRIORITIES, ASSIGNMENT_STATUSES } from "@workspace/db";

const PAGE_SIZE = 25;

function extractCertNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && "name" in item) {
      return [String((item as { name?: unknown }).name ?? "")].filter(Boolean);
    }
    return [];
  });
}

function regionTerm(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? `%${trimmed}%` : null;
}

function personnelRegionCondition(tenantId: string, term: string) {
  return or(
    ilike(personnelTable.region, term),
    sql<boolean>`exists (
      select 1
      from jsonb_array_elements_text(${personnelTable.preferredRegions}) as preferred_region(name)
      where preferred_region.name ilike ${term}
    )`,
    sql<boolean>`exists (
      select 1
      from personnel_regions pr
      inner join tenant_regions tr on tr.id = pr.tenant_region_id
      where pr.personnel_id = ${personnelTable.id}
        and pr.tenant_id = ${tenantId}::uuid
        and tr.tenant_id = ${tenantId}::uuid
        and tr.is_active = true
        and tr.name ilike ${term}
    )`,
  );
}

function objectRegionCondition(tenantId: string, term: string) {
  return or(
    ilike(objectsTable.city, term),
    sql<boolean>`exists (
      select 1
      from object_regions object_region
      inner join tenant_regions tr on tr.id = object_region.tenant_region_id
      where object_region.object_id = ${objectsTable.id}
        and object_region.tenant_id = ${tenantId}::uuid
        and tr.tenant_id = ${tenantId}::uuid
        and tr.is_active = true
        and tr.name ilike ${term}
    )`,
  );
}

function assignmentRegionCondition(tenantId: string, term: string) {
  return or(
    ilike(assignmentsTable.requiredRegion, term),
    sql<boolean>`exists (
      select 1
      from assignment_required_regions required_region
      inner join tenant_regions tr on tr.id = required_region.tenant_region_id
      where required_region.assignment_id = ${assignmentsTable.id}
        and required_region.tenant_id = ${tenantId}::uuid
        and tr.tenant_id = ${tenantId}::uuid
        and tr.is_active = true
        and tr.name ilike ${term}
    )`,
  );
}

export async function listPersonnelRegionAware(params: {
  search?: string;
  roleId?: string;
  region?: string;
  status?: string;
  personnelType?: string;
  sectorId?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: PersonnelRow[]; total: number }> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();
  const {
    search,
    roleId,
    region,
    status = "all",
    personnelType,
    sectorId,
    page = 1,
    sort = "lastName",
    dir = "asc",
  } = params;

  const conditions = [eq(personnelTable.tenantId, tenantId)];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(personnelTable.firstName, term),
      ilike(personnelTable.lastName, term),
      ilike(personnelTable.email, term),
      ilike(personnelTable.code, term),
    );
    if (clause) conditions.push(clause);
  }
  if (roleId) conditions.push(eq(personnelTable.roleId, roleId));
  if (sectorId) conditions.push(eq(personnelTable.sectorId, sectorId));
  const regionFilter = regionTerm(region);
  if (regionFilter) {
    const clause = personnelRegionCondition(tenantId, regionFilter);
    if (clause) conditions.push(clause);
  }
  if (status === "active") conditions.push(eq(personnelTable.isActive, true));
  if (status === "inactive") conditions.push(eq(personnelTable.isActive, false));
  if (personnelType) conditions.push(eq(personnelTable.personnelType, personnelType));

  const sortMap = {
    lastName: personnelTable.lastName,
    firstName: personnelTable.firstName,
    email: personnelTable.email,
    code: personnelTable.code,
    region: personnelTable.region,
    createdAt: personnelTable.createdAt,
  } as const;
  const sortCol = sortMap[sort as keyof typeof sortMap] ?? personnelTable.lastName;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: personnelTable.id,
        code: personnelTable.code,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        email: personnelTable.email,
        phone: personnelTable.phone,
        addressStreet: personnelTable.addressStreet,
        addressPostalCode: personnelTable.addressPostalCode,
        addressCity: personnelTable.addressCity,
        addressCountry: personnelTable.addressCountry,
        addressGeocodingStatus: personnelTable.addressGeocodingStatus,
        addressGeocodingError: personnelTable.addressGeocodingError,
        roleId: personnelTable.roleId,
        roleName: rolesTable.name,
        sectorId: personnelTable.sectorId,
        sectorName: sectorsTable.name,
        region: personnelTable.region,
        vehicleType: personnelTable.vehicleType,
        certificates: personnelTable.certificates,
        isActive: personnelTable.isActive,
        isAvailable: personnelTable.isAvailable,
        userId: personnelTable.userId,
        inviteSentAt: personnelTable.inviteSentAt,
        createdAt: personnelTable.createdAt,
        personnelType: personnelTable.personnelType,
        emergencyAvailable: personnelTable.emergencyAvailable,
        preferredRegions: personnelTable.preferredRegions,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(personnelTable).where(where),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const statusMap = await getBatchAvailabilityStatus(rows.map((row) => row.id), today);

  return {
    rows: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      inviteSentAt: row.inviteSentAt ? row.inviteSentAt.toISOString() : null,
      availabilityStatus: statusMap[row.id] ?? ("niet_ingesteld" as AvailabilityStatus),
      certificates: extractCertNames(row.certificates),
      preferredRegions: (row.preferredRegions as string[]) ?? [],
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function listObjectsRegionAware(params: {
  search?: string;
  customerId?: string;
  serviceType?: string;
  region?: string;
  status?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: ObjectRow[]; total: number }> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();
  const {
    search,
    customerId,
    serviceType,
    region,
    status = "all",
    page = 1,
    sort = "name",
    dir = "asc",
  } = params;

  const conditions = [eq(objectsTable.tenantId, tenantId)];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(objectsTable.name, term),
      ilike(objectsTable.code, term),
      ilike(customersTable.name, term),
    );
    if (clause) conditions.push(clause);
  }
  if (customerId) conditions.push(eq(objectsTable.customerId, customerId));
  if (serviceType?.trim()) conditions.push(ilike(objectsTable.serviceType, `%${serviceType.trim()}%`));
  const regionFilter = regionTerm(region);
  if (regionFilter) {
    const clause = objectRegionCondition(tenantId, regionFilter);
    if (clause) conditions.push(clause);
  }
  if (status === "active") conditions.push(eq(objectsTable.isActive, true));
  if (status === "inactive") conditions.push(eq(objectsTable.isActive, false));

  const nextServiceSql = sql<string | null>`(
    select a.scheduled_date
    from assignments a
    where a.object_id = ${objectsTable.id}
      and a.tenant_id = ${objectsTable.tenantId}
      and a.scheduled_date >= to_char(current_date, 'YYYY-MM-DD')
      and a.status in ('scheduled', 'plannable', 'approved', 'seen', 'en_route')
    order by a.scheduled_date asc
    limit 1
  )`;
  const sortMap = {
    name: objectsTable.name,
    code: objectsTable.code,
    city: objectsTable.city,
    createdAt: objectsTable.createdAt,
  } as const;
  const sortCol = sortMap[sort as keyof typeof sortMap] ?? objectsTable.name;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: objectsTable.id,
        customerId: objectsTable.customerId,
        customerName: customersTable.name,
        sectorId: objectsTable.sectorId,
        sectorName: sectorsTable.name,
        name: objectsTable.name,
        code: objectsTable.code,
        address: objectsTable.address,
        city: objectsTable.city,
        serviceType: objectsTable.serviceType,
        nextServiceDate: nextServiceSql,
        isActive: objectsTable.isActive,
        createdAt: objectsTable.createdAt,
      })
      .from(objectsTable)
      .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
      .leftJoin(sectorsTable, eq(objectsTable.sectorId, sectorsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(objectsTable)
      .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      nextServiceDate: row.nextServiceDate ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function listAssignmentsRegionAware(params: {
  page?: number;
  search?: string;
  status?: string;
  priority?: string;
  reportStatus?: string;
  region?: string;
  sort?: string;
  dir?: string;
}): Promise<{ rows: AssignmentRow[]; total: number }> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return { rows: [], total: 0 };
  const tenantId = await requireCurrentTenantId();
  const {
    page = 1,
    search = "",
    status = "",
    priority = "",
    reportStatus = "",
    region = "",
    sort = "createdAt",
    dir = "desc",
  } = params;

  const sortable = ["title", "scheduledDate", "createdAt", "status", "priority"] as const;
  const safeSort = sortable.includes(sort as (typeof sortable)[number])
    ? (sort as (typeof sortable)[number])
    : "createdAt";
  const conditions = [eq(assignmentsTable.tenantId, tenantId)];

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(assignmentsTable.title, term),
      ilike(assignmentsTable.code, term),
      ilike(customersTable.name, term),
    );
    if (clause) conditions.push(clause);
  }
  if (status && ASSIGNMENT_STATUSES.includes(status as AssignmentStatus)) conditions.push(eq(assignmentsTable.status, status));
  if (priority && ASSIGNMENT_PRIORITIES.includes(priority as AssignmentPriority)) conditions.push(eq(assignmentsTable.priority, priority));
  const regionFilter = regionTerm(region);
  if (regionFilter) {
    const clause = assignmentRegionCondition(tenantId, regionFilter);
    if (clause) conditions.push(clause);
  }

  const reportEligibleStatuses: AssignmentStatus[] = [
    "completed",
    "not_completed",
    "report_submitted",
    "report_approved",
    "invoice_ready",
    "invoiced",
    "paid",
    "closed",
  ];
  if (reportStatus === "none") {
    conditions.push(
      and(
        inArray(assignmentsTable.status, reportEligibleStatuses),
        isNull(sql<string>`(select r.status from reports r where r.assignment_id = ${assignmentsTable.id} order by r.submitted_at desc limit 1)`),
      )!,
    );
  } else if (["submitted", "approved", "rejected"].includes(reportStatus)) {
    conditions.push(
      eq(
        sql<string>`(select r.status from reports r where r.assignment_id = ${assignmentsTable.id} order by r.submitted_at desc limit 1)`,
        reportStatus,
      ),
    );
  }

  const sortCol = {
    title: assignmentsTable.title,
    scheduledDate: assignmentsTable.scheduledDate,
    createdAt: assignmentsTable.createdAt,
    status: assignmentsTable.status,
    priority: assignmentsTable.priority,
  }[safeSort];
  const where = and(...conditions);
  const orderFn = dir === "asc" ? asc : desc;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: assignmentsTable.id,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
        status: assignmentsTable.status,
        priority: assignmentsTable.priority,
        scheduledDate: assignmentsTable.scheduledDate,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
        customerId: assignmentsTable.customerId,
        customerName: customersTable.name,
        objectId: assignmentsTable.objectId,
        objectName: objectsTable.name,
        createdAt: assignmentsTable.createdAt,
        personnelCount: sql<number>`(
          select count(*)::int from assignment_personnel ap
          where ap.assignment_id = ${assignmentsTable.id}
            and ap.status = 'assigned'
        )`,
        reportStatus: sql<string | null>`(
          select status from reports r
          where r.assignment_id = ${assignmentsTable.id}
          order by r.submitted_at desc
          limit 1
        )`,
      })
      .from(assignmentsTable)
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(where)
      .orderBy(orderFn(sortCol!))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      status: row.status as AssignmentStatus,
      priority: row.priority as AssignmentPriority,
      objectId: row.objectId ?? null,
      objectName: row.objectName ?? null,
      scheduledDate: row.scheduledDate ?? null,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      customerName: row.customerName ?? "",
      reportStatus: row.reportStatus ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: countRows[0]?.count ?? 0,
  };
}
