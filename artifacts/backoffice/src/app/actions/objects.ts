"use server";

import { db } from "@workspace/db";
import {
  objectsTable,
  customersTable,
  sectorsTable,
  auditLogTable,
  insertObjectSchema,
  updateObjectSchema,
  objectContactsTable,
  insertObjectContactSchema,
  objectPersonnelTable,
  personnelTable,
  rolesTable,
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentPhotosTable,
  assignmentReportNoteAttachmentsTable,
  documentsTable,
  reportsTable,
} from "@workspace/db";
import { OBJECT_ACTIVE_ASSIGNMENT_STATUSES } from "@workspace/db/object-metrics";
import { eq, ilike, or, and, asc, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  geocodeAddress,
  hasGeocodableAddress,
  type GeocodeAddressInput,
} from "@/lib/planning/geocoding";
import { safeRefreshPlanningRoutesForObject } from "@/lib/planning/route-refresh";
import type { ActionResult } from "./customers";

export type { ActionResult };

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type CustomerOption = {
  id: string;
  name: string;
  code: string;
};

export type ObjectRow = {
  id: string;
  customerId: string;
  customerName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  serviceType: string | null;
  nextServiceDate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ObjectDetail = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerCode: string | null;
  sectorId: string | null;
  sectorName: string | null;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  geocodedAt: string | null;
  geocodingProvider: string | null;
  geocodingStatus: string;
  geocodingConfidence: string | null;
  geocodingError: string | null;
  description: string | null;
  contactName: string | null;
  contactFunction: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  serviceType: string | null;
  fixedInstructions: string | null;
  specialNotes: string | null;
  requiredRoles: string[];
  requiredCertificates: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ObjectFormInput = {
  customerId: string;
  sectorId?: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  description?: string;
  contactName?: string;
  contactFunction?: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceType?: string;
  fixedInstructions?: string;
  specialNotes?: string;
  requiredRoles?: string[];
  requiredCertificates?: string[];
  googlePlace?: {
    googlePlaceId: string;
    formattedAddress: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    stateOrRegion: string | null;
    countryCode: string;
    latitude: number | null;
    longitude: number | null;
  };
};

export type ObjectContactRow = {
  id: string;
  objectId: string;
  firstName: string;
  lastName: string;
  function: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};

export type ObjectContactInput = {
  firstName: string;
  lastName: string;
  function?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
};

export type ObjectPersonnelRow = {
  personnelId: string;
  firstName: string;
  lastName: string;
  code: string;
  roleName: string | null;
  linkedAt: string;
  assignmentCount: number;
  completedCount: number;
  lastWorkedAt: string | null;
};

export type PersonnelOption = {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  roleName: string | null;
};

export type ObjectStats = {
  totalObjects: number;
  activeAssignments: number;
  distinctServiceTypes: number;
  inactiveObjects: number;
  objectDocuments: number;
};

export type ObjectPerformance = {
  totalAssignments: number;
  activeAssignments: number;
  completedAssignments: number;
  notCompletedAssignments: number;
  reportsSubmitted: number;
  reportsApproved: number;
  mediaItems: number;
  documents: number;
  fixedPersonnel: number;
  openActions: number;
  completionRate: number;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
};

export type ObjectHistoryEntry = {
  id: string;
  type: "assignment" | "report" | "media" | "document";
  title: string;
  description: string | null;
  status: string | null;
  occurredAt: string;
  href: string | null;
  badge: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toNullableDate(value: string | null | undefined): string | null {
  return value || null;
}

function normalizeLocationPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = (value ?? "NL").trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : "NL";
}

function formatManualObjectAddress(input: GeocodeAddressInput): string | null {
  const cityLine = [input.postalCode, input.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const parts = [
    input.address?.trim(),
    cityLine || null,
    normalizeCountryCode(input.country) === "NL" ? "Nederland" : input.country?.trim(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function manualObjectLocationFields(input: GeocodeAddressInput) {
  const formattedAddress = formatManualObjectAddress(input);
  return {
    addressLine1: input.address?.trim() || null,
    addressLine2: null,
    stateOrRegion: null,
    countryCode: normalizeCountryCode(input.country),
    formattedAddress,
    googlePlaceId: null,
    locationSource: formattedAddress ? "manual" : null,
    locationVerifiedAt: null,
    locationUpdatedAt: new Date(),
  };
}

function geocodingResetForAddress(input: GeocodeAddressInput) {
  return {
    ...manualObjectLocationFields(input),
    latitude: null,
    longitude: null,
    geocodedAt: null,
    geocodingProvider: null,
    geocodingStatus: hasGeocodableAddress(input) ? "pending" : "not_required",
    geocodingConfidence: null,
    geocodingError: null,
  };
}

function locationChanged(
  existing: GeocodeAddressInput,
  next: GeocodeAddressInput,
): boolean {
  return (
    normalizeLocationPart(existing.address) !== normalizeLocationPart(next.address) ||
    normalizeLocationPart(existing.postalCode) !== normalizeLocationPart(next.postalCode) ||
    normalizeLocationPart(existing.city) !== normalizeLocationPart(next.city)
  );
}

function coordinateString(value: number): string {
  return value.toFixed(6);
}

function confidenceString(value: number): string {
  return value.toFixed(2);
}

async function buildObjectAddressGeocodePatch(
  input: GeocodeAddressInput & { googlePlace?: ObjectFormInput["googlePlace"] },
) {
  if (input.googlePlace?.googlePlaceId) {
    const fallbackAddress = formatManualObjectAddress(input);
    return {
      addressLine1: input.googlePlace.addressLine1 ?? input.address,
      addressLine2: input.googlePlace.addressLine2,
      stateOrRegion: input.googlePlace.stateOrRegion,
      countryCode: input.googlePlace.countryCode,
      formattedAddress: input.googlePlace.formattedAddress ?? fallbackAddress,
      googlePlaceId: input.googlePlace.googlePlaceId,
      locationSource: "google_places",
      locationVerifiedAt: new Date(),
      locationUpdatedAt: new Date(),
      latitude: input.googlePlace.latitude != null ? coordinateString(input.googlePlace.latitude) : null,
      longitude: input.googlePlace.longitude != null ? coordinateString(input.googlePlace.longitude) : null,
      geocodedAt: input.googlePlace.latitude != null && input.googlePlace.longitude != null ? new Date() : null,
      geocodingProvider: "google_places",
      geocodingStatus: input.googlePlace.latitude != null && input.googlePlace.longitude != null ? "geocoded" : "not_required",
      geocodingConfidence: input.googlePlace.latitude != null && input.googlePlace.longitude != null ? "1.00" : null,
      geocodingError: null,
    };
  }

  const addressInput = { ...input, country: input.country ?? "NL" };
  const manualLocation = manualObjectLocationFields(addressInput);

  if (!hasGeocodableAddress(addressInput)) {
    return geocodingResetForAddress(addressInput);
  }

  const result = await geocodeAddress(addressInput);
  if (!result.success) {
    return {
      ...manualLocation,
      latitude: null,
      longitude: null,
      geocodedAt: null,
      geocodingProvider: result.provider,
      geocodingStatus: "failed",
      geocodingConfidence: null,
      geocodingError: result.error,
    };
  }

  return {
    ...manualLocation,
    locationVerifiedAt: new Date(),
    latitude: coordinateString(result.latitude),
    longitude: coordinateString(result.longitude),
    geocodedAt: new Date(),
    geocodingProvider: result.provider,
    geocodingStatus: "geocoded",
    geocodingConfidence: confidenceString(result.confidence),
    geocodingError: null,
  };
}

async function getObjectScope(objectId: string): Promise<{
  objectId: string;
  customerId: string;
  tenantId: string;
} | null> {
  const [row] = await db
    .select({
      objectId:   objectsTable.id,
      customerId: objectsTable.customerId,
      tenantId:   objectsTable.tenantId,
    })
    .from(objectsTable)
    .innerJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
    .where(and(eq(objectsTable.id, objectId), eq(customersTable.tenantId, objectsTable.tenantId)))
    .limit(1);

  return row ?? null;
}

// ─── Subquery: next scheduled service date for an object ──────────────────────

const nextServiceSql = sql<string | null>`(
  SELECT a.scheduled_date
  FROM assignments a
  WHERE a.object_id = ${objectsTable.id}
    AND a.tenant_id = ${objectsTable.tenantId}
    AND a.scheduled_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
    AND a.status IN ('scheduled', 'plannable', 'approved', 'seen')
  ORDER BY a.scheduled_date ASC
  LIMIT 1
)`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listObjects(params: {
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

  const conditions: ReturnType<typeof eq>[] = [
    eq(objectsTable.tenantId, tenantId) as ReturnType<typeof eq>,
  ];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(objectsTable.name, term),
      ilike(objectsTable.code, term),
      ilike(customersTable.name, term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (customerId)   conditions.push(eq(objectsTable.customerId, customerId) as ReturnType<typeof eq>);
  if (serviceType?.trim()) {
    const stClause = ilike(objectsTable.serviceType, `%${serviceType.trim()}%`);
    conditions.push(stClause as ReturnType<typeof eq>);
  }
  if (region?.trim()) {
    const rClause = ilike(objectsTable.city, `%${region.trim()}%`);
    conditions.push(rClause as ReturnType<typeof eq>);
  }
  if (status === "active")   conditions.push(eq(objectsTable.isActive, true)  as ReturnType<typeof eq>);
  if (status === "inactive") conditions.push(eq(objectsTable.isActive, false) as ReturnType<typeof eq>);

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    name:      objectsTable.name,
    code:      objectsTable.code,
    city:      objectsTable.city,
    createdAt: objectsTable.createdAt,
  };
  const sortCol = (sortMap[sort] ?? objectsTable.name) as typeof objectsTable.name;

  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:              objectsTable.id,
        customerId:      objectsTable.customerId,
        customerName:    customersTable.name,
        sectorId:        objectsTable.sectorId,
        sectorName:      sectorsTable.name,
        name:            objectsTable.name,
        code:            objectsTable.code,
        address:         objectsTable.address,
        city:            objectsTable.city,
        serviceType:     objectsTable.serviceType,
        nextServiceDate: nextServiceSql,
        isActive:        objectsTable.isActive,
        createdAt:       objectsTable.createdAt,
      })
      .from(objectsTable)
      .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
      .leftJoin(sectorsTable,   eq(objectsTable.sectorId,   sectorsTable.id))
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
    rows: rows.map((r) => ({
      ...r,
      nextServiceDate: r.nextServiceDate ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getObjectStats(): Promise<ObjectStats> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  try {
    const [totalRow, assignmentRow, serviceTypeRow, inactiveRow, documentRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(objectsTable).where(eq(objectsTable.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)::int` }).from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.tenantId, tenantId),
            sql`${assignmentsTable.objectId} IS NOT NULL`,
            inArray(assignmentsTable.status, [...OBJECT_ACTIVE_ASSIGNMENT_STATUSES]),
          ),
        ),
      db.select({ count: sql<number>`count(DISTINCT ${objectsTable.serviceType})::int` }).from(objectsTable)
        .where(and(eq(objectsTable.tenantId, tenantId), sql`${objectsTable.serviceType} IS NOT NULL AND trim(${objectsTable.serviceType}) <> ''`)),
      db.select({ count: sql<number>`count(*)::int` }).from(objectsTable).where(and(eq(objectsTable.tenantId, tenantId), eq(objectsTable.isActive, false))),
      db.select({ count: sql<number>`count(*)::int` }).from(documentsTable)
        .where(
          and(
            eq(documentsTable.tenantId, tenantId),
            eq(documentsTable.entityType, "object"),
          ),
        ),
    ]);

    return {
      totalObjects:         totalRow[0]?.count       ?? 0,
      activeAssignments:    assignmentRow[0]?.count  ?? 0,
      distinctServiceTypes: serviceTypeRow[0]?.count ?? 0,
      inactiveObjects:      inactiveRow[0]?.count    ?? 0,
      objectDocuments:      documentRow[0]?.count    ?? 0,
    };
  } catch (err) {
    console.error("Object statistics failed", err);
    return {
      totalObjects: 0,
      activeAssignments: 0,
      distinctServiceTypes: 0,
      inactiveObjects: 0,
      objectDocuments: 0,
    };
  }
}

export async function getObject(id: string): Promise<ObjectDetail | null> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id:                   objectsTable.id,
      customerId:           objectsTable.customerId,
      customerName:         customersTable.name,
      customerCode:         customersTable.code,
      sectorId:             objectsTable.sectorId,
      sectorName:           sectorsTable.name,
      name:                 objectsTable.name,
      code:                 objectsTable.code,
      address:              objectsTable.address,
      city:                 objectsTable.city,
      postalCode:           objectsTable.postalCode,
      latitude:             objectsTable.latitude,
      longitude:            objectsTable.longitude,
      geocodedAt:           objectsTable.geocodedAt,
      geocodingProvider:    objectsTable.geocodingProvider,
      geocodingStatus:      objectsTable.geocodingStatus,
      geocodingConfidence:  objectsTable.geocodingConfidence,
      geocodingError:       objectsTable.geocodingError,
      description:          objectsTable.description,
      contactName:          objectsTable.contactName,
      contactFunction:      objectsTable.contactFunction,
      contactPhone:         objectsTable.contactPhone,
      contactEmail:         objectsTable.contactEmail,
      serviceType:          objectsTable.serviceType,
      fixedInstructions:    objectsTable.fixedInstructions,
      specialNotes:         objectsTable.specialNotes,
      requiredRoles:        objectsTable.requiredRoles,
      requiredCertificates: objectsTable.requiredCertificates,
      isActive:             objectsTable.isActive,
      createdAt:            objectsTable.createdAt,
      updatedAt:            objectsTable.updatedAt,
    })
    .from(objectsTable)
    .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
    .leftJoin(sectorsTable,   eq(objectsTable.sectorId,   sectorsTable.id))
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    requiredRoles:        (r.requiredRoles as string[])        ?? [],
    requiredCertificates: (r.requiredCertificates as string[]) ?? [],
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    geocodedAt: r.geocodedAt?.toISOString() ?? null,
    geocodingProvider: r.geocodingProvider,
    geocodingStatus: r.geocodingStatus ?? "pending",
    geocodingConfidence: r.geocodingConfidence ?? null,
    geocodingError: r.geocodingError,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getObjectPerformance(objectId: string): Promise<ObjectPerformance> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();
  const [canReadAssignments, canReadReports, canReadDocuments] =
    await Promise.all([
      hasPermission("assignments", "read"),
      hasPermission("reports", "read"),
      hasPermission("documents", "read"),
    ]);

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) {
    return {
      totalAssignments: 0,
      activeAssignments: 0,
      completedAssignments: 0,
      notCompletedAssignments: 0,
      reportsSubmitted: 0,
      reportsApproved: 0,
      mediaItems: 0,
      documents: 0,
      fixedPersonnel: 0,
      openActions: 0,
      completionRate: 0,
      lastServiceDate: null,
      nextServiceDate: null,
    };
  }

  const [
    assignmentStats,
    reportStats,
    photoStats,
    noteAttachmentStats,
    documentStats,
    fixedPersonnelStats,
  ] = await Promise.all([
    canReadAssignments ? db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${assignmentsTable.status} in ('approved','plannable','scheduled','seen','en_route','in_progress'))::int`,
        completed: sql<number>`count(*) filter (where ${assignmentsTable.status} in ('completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed'))::int`,
        notCompleted: sql<number>`count(*) filter (where ${assignmentsTable.status} = 'not_completed')::int`,
        openActions: sql<number>`count(*) filter (where ${assignmentsTable.status} in ('requested','review','quote_preparation','awaiting_approval','not_completed','report_submitted'))::int`,
        lastServiceDate: sql<string | null>`max(${assignmentsTable.actualCompletedAt}) filter (where ${assignmentsTable.actualCompletedAt} is not null and ${assignmentsTable.status} in ('completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed'))::text`,
        nextServiceDate: sql<string | null>`min(${assignmentsTable.scheduledDate}) filter (where ${assignmentsTable.scheduledDate} >= to_char(current_date, 'YYYY-MM-DD') and ${assignmentsTable.status} in ('approved','plannable','scheduled','seen','en_route','in_progress'))`,
      })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      ) : Promise.resolve([]),
    canReadReports ? db
      .select({
        submitted: sql<number>`count(*) filter (where ${reportsTable.status} = 'submitted')::int`,
        approved: sql<number>`count(*) filter (where ${reportsTable.status} = 'approved')::int`,
      })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      ) : Promise.resolve([]),
    canReadAssignments ? db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentPhotosTable)
      .innerJoin(assignmentsTable, eq(assignmentPhotosTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      ) : Promise.resolve([]),
    canReadReports ? db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentReportNoteAttachmentsTable)
      .innerJoin(assignmentsTable, eq(assignmentReportNoteAttachmentsTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      ) : Promise.resolve([]),
    canReadDocuments ? db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.tenantId, scope.tenantId),
          eq(documentsTable.entityType, "object"),
          eq(documentsTable.entityId, objectId),
        ),
      ) : Promise.resolve([]),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectPersonnelTable)
      .where(eq(objectPersonnelTable.objectId, objectId)),
  ]);

  const assignments = assignmentStats[0];
  const reports = reportStats[0];
  const completed = assignments?.completed ?? 0;
  const notCompleted = assignments?.notCompleted ?? 0;
  const completionBase = completed + notCompleted;

  return {
    totalAssignments: assignments?.total ?? 0,
    activeAssignments: assignments?.active ?? 0,
    completedAssignments: completed,
    notCompletedAssignments: notCompleted,
    reportsSubmitted: reports?.submitted ?? 0,
    reportsApproved: reports?.approved ?? 0,
    mediaItems: (photoStats[0]?.count ?? 0) + (noteAttachmentStats[0]?.count ?? 0),
    documents: documentStats[0]?.count ?? 0,
    fixedPersonnel: fixedPersonnelStats[0]?.count ?? 0,
    openActions: assignments?.openActions ?? 0,
    completionRate: completionBase > 0 ? Math.round((completed / completionBase) * 100) : 0,
    lastServiceDate: toNullableDate(assignments?.lastServiceDate),
    nextServiceDate: toNullableDate(assignments?.nextServiceDate),
  };
}

export async function listObjectHistory(
  objectId: string,
  limit = 40,
): Promise<ObjectHistoryEntry[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();
  const [canReadAssignments, canReadReports, canReadDocuments] =
    await Promise.all([
      hasPermission("assignments", "read"),
      hasPermission("reports", "read"),
      hasPermission("documents", "read"),
    ]);

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) return [];

  const [assignments, reports, photos, noteAttachments, documents] = await Promise.all([
    canReadAssignments ? db
      .select({
        id: assignmentsTable.id,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
        status: assignmentsTable.status,
        scheduledDate: assignmentsTable.scheduledDate,
        createdAt: assignmentsTable.createdAt,
      })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      )
      .orderBy(desc(assignmentsTable.createdAt))
      .limit(limit) : Promise.resolve([]),
    canReadReports ? db
      .select({
        id: reportsTable.id,
        status: reportsTable.status,
        submittedAt: reportsTable.submittedAt,
        assignmentId: assignmentsTable.id,
        assignmentCode: assignmentsTable.code,
        assignmentTitle: assignmentsTable.title,
      })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      )
      .orderBy(desc(reportsTable.submittedAt))
      .limit(limit) : Promise.resolve([]),
    canReadAssignments ? db
      .select({
        id: assignmentPhotosTable.id,
        createdAt: assignmentPhotosTable.createdAt,
        assignmentId: assignmentsTable.id,
        assignmentCode: assignmentsTable.code,
      })
      .from(assignmentPhotosTable)
      .innerJoin(assignmentsTable, eq(assignmentPhotosTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      )
      .orderBy(desc(assignmentPhotosTable.createdAt))
      .limit(limit) : Promise.resolve([]),
    canReadReports ? db
      .select({
        id: assignmentReportNoteAttachmentsTable.id,
        fileName: assignmentReportNoteAttachmentsTable.fileName,
        createdAt: assignmentReportNoteAttachmentsTable.createdAt,
        assignmentId: assignmentsTable.id,
        assignmentCode: assignmentsTable.code,
      })
      .from(assignmentReportNoteAttachmentsTable)
      .innerJoin(assignmentsTable, eq(assignmentReportNoteAttachmentsTable.assignmentId, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.objectId, objectId),
          eq(assignmentsTable.tenantId, scope.tenantId),
        ),
      )
      .orderBy(desc(assignmentReportNoteAttachmentsTable.createdAt))
      .limit(limit) : Promise.resolve([]),
    canReadDocuments ? db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        createdAt: documentsTable.createdAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.tenantId, scope.tenantId),
          eq(documentsTable.entityType, "object"),
          eq(documentsTable.entityId, objectId),
        ),
      )
      .orderBy(desc(documentsTable.createdAt))
      .limit(limit) : Promise.resolve([]),
  ]);

  const entries: ObjectHistoryEntry[] = [
    ...assignments.map((row) => ({
      id: `assignment-${row.id}`,
      type: "assignment" as const,
      title: `${row.code} - ${row.title}`,
      description: row.scheduledDate ? `Gepland op ${row.scheduledDate}` : "Opdracht aangemaakt",
      status: row.status,
      occurredAt: toIso(row.scheduledDate ?? row.createdAt),
      href: `/assignments/${row.id}`,
      badge: "Opdracht",
    })),
    ...reports.map((row) => ({
      id: `report-${row.id}`,
      type: "report" as const,
      title: `Rapportage ${row.assignmentCode}`,
      description: row.assignmentTitle,
      status: row.status,
      occurredAt: toIso(row.submittedAt),
      href: `/reports/${row.id}`,
      badge: "Rapportage",
    })),
    ...photos.map((row) => ({
      id: `photo-${row.id}`,
      type: "media" as const,
      title: `Foto toegevoegd bij ${row.assignmentCode}`,
      description: "Werkbonmedia",
      status: null,
      occurredAt: toIso(row.createdAt),
      href: `/assignments/${row.assignmentId}`,
      badge: "Foto",
    })),
    ...noteAttachments.map((row) => ({
      id: `attachment-${row.id}`,
      type: "media" as const,
      title: row.fileName,
      description: `Bijlage bij ${row.assignmentCode}`,
      status: null,
      occurredAt: toIso(row.createdAt),
      href: `/assignments/${row.assignmentId}`,
      badge: "Bijlage",
    })),
    ...documents.map((row) => ({
      id: `document-${row.id}`,
      type: "document" as const,
      title: row.name,
      description: "Objectdocument",
      status: null,
      occurredAt: toIso(row.createdAt),
      href: "/documents",
      badge: "Document",
    })),
  ];

  return entries
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

export async function listObjectsForCustomer(customerId: string): Promise<ObjectRow[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id:              objectsTable.id,
      customerId:      objectsTable.customerId,
      customerName:    customersTable.name,
      sectorId:        objectsTable.sectorId,
      sectorName:      sectorsTable.name,
      name:            objectsTable.name,
      code:            objectsTable.code,
      address:         objectsTable.address,
      city:            objectsTable.city,
      serviceType:     objectsTable.serviceType,
      nextServiceDate: nextServiceSql,
      isActive:        objectsTable.isActive,
      createdAt:       objectsTable.createdAt,
    })
    .from(objectsTable)
    .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
    .leftJoin(sectorsTable,   eq(objectsTable.sectorId,   sectorsTable.id))
    .where(and(eq(objectsTable.customerId, customerId), eq(objectsTable.tenantId, tenantId)))
    .orderBy(asc(objectsTable.name));

  return rows.map((r) => ({ ...r, nextServiceDate: r.nextServiceDate ?? null, createdAt: r.createdAt.toISOString() }));
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  return db
    .select({
      id:   customersTable.id,
      name: customersTable.name,
      code: customersTable.code,
    })
    .from(customersTable)
    .where(and(eq(customersTable.tenantId, tenantId), eq(customersTable.isActive, true)))
    .orderBy(asc(customersTable.name));
}

// ─── Object contacts ──────────────────────────────────────────────────────────

export async function listObjectContacts(objectId: string): Promise<ObjectContactRow[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) return [];

  const rows = await db
    .select()
    .from(objectContactsTable)
    .where(eq(objectContactsTable.objectId, objectId))
    .orderBy(desc(objectContactsTable.isPrimary), asc(objectContactsTable.lastName));

  return rows.map((r) => ({
    id:        r.id,
    objectId:  r.objectId,
    firstName: r.firstName,
    lastName:  r.lastName,
    function:  r.function  ?? null,
    phone:     r.phone     ?? null,
    email:     r.email     ?? null,
    isPrimary: r.isPrimary,
  }));
}

export async function addObjectContact(
  objectId: string,
  data: ObjectContactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) {
    return { success: false, message: "Object niet gevonden binnen deze tenant." };
  }

  const payload = {
    objectId,
    firstName: data.firstName.trim(),
    lastName:  data.lastName.trim(),
    function:  data.function?.trim() || null,
    phone:     data.phone?.trim()    || null,
    email:     data.email?.trim()    || null,
    isPrimary: data.isPrimary ?? false,
  };

  const parsed = insertObjectContactSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: "Validatie mislukt." };

  if (payload.isPrimary) {
    await db
      .update(objectContactsTable)
      .set({ isPrimary: false })
      .where(eq(objectContactsTable.objectId, objectId));
  }

  const [created] = await db
    .insert(objectContactsTable)
    .values(parsed.data)
    .returning({ id: objectContactsTable.id });

  revalidatePath(`/objects/${objectId}`);
  return { success: true, data: { id: created!.id } };
}

export async function updateObjectContact(
  contactId: string,
  objectId: string,
  data: ObjectContactInput,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) {
    return { success: false, message: "Object niet gevonden binnen deze tenant." };
  }

  const payload = {
    firstName: data.firstName.trim(),
    lastName:  data.lastName.trim(),
    function:  data.function?.trim() || null,
    phone:     data.phone?.trim()    || null,
    email:     data.email?.trim()    || null,
    isPrimary: data.isPrimary ?? false,
  };

  if (payload.isPrimary) {
    await db
      .update(objectContactsTable)
      .set({ isPrimary: false })
      .where(eq(objectContactsTable.objectId, objectId));
  }

  await db
    .update(objectContactsTable)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(objectContactsTable.id, contactId), eq(objectContactsTable.objectId, objectId)));

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

export async function deleteObjectContact(
  contactId: string,
  objectId: string,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) {
    return { success: false, message: "Object niet gevonden binnen deze tenant." };
  }

  await db
    .delete(objectContactsTable)
    .where(and(eq(objectContactsTable.id, contactId), eq(objectContactsTable.objectId, objectId)));

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

// ─── Object personnel ─────────────────────────────────────────────────────────

export async function listObjectPersonnel(objectId: string): Promise<ObjectPersonnelRow[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) return [];

  const rows = await db
    .select({
      personnelId: objectPersonnelTable.personnelId,
      firstName:   personnelTable.firstName,
      lastName:    personnelTable.lastName,
      code:        personnelTable.code,
      roleName:    rolesTable.name,
      linkedAt:    objectPersonnelTable.linkedAt,
      assignmentCount: sql<number>`(
        select count(*)::int
        from assignment_personnel ap
        inner join assignments a on a.id = ap.assignment_id
        where ap.personnel_id = ${objectPersonnelTable.personnelId}
          and ap.status = 'assigned'
          and a.object_id = ${objectId}
          and a.tenant_id = ${scope.tenantId}
      )`,
      completedCount: sql<number>`(
        select count(*)::int
        from assignment_personnel ap
        inner join assignments a on a.id = ap.assignment_id
        where ap.personnel_id = ${objectPersonnelTable.personnelId}
          and ap.status = 'assigned'
          and a.object_id = ${objectId}
          and a.tenant_id = ${scope.tenantId}
          and a.status in ('completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed')
      )`,
      lastWorkedAt: sql<string | null>`(
        select max(a.scheduled_date)
        from assignment_personnel ap
        inner join assignments a on a.id = ap.assignment_id
        where ap.personnel_id = ${objectPersonnelTable.personnelId}
          and ap.status = 'assigned'
          and a.object_id = ${objectId}
          and a.tenant_id = ${scope.tenantId}
      )`,
    })
    .from(objectPersonnelTable)
    .innerJoin(personnelTable, eq(objectPersonnelTable.personnelId, personnelTable.id))
    .leftJoin(rolesTable,      eq(personnelTable.roleId, rolesTable.id))
    .where(and(eq(objectPersonnelTable.objectId, objectId), eq(personnelTable.tenantId, tenantId)))
    .orderBy(asc(personnelTable.lastName));

  return rows.map((r) => ({
    personnelId: r.personnelId,
    firstName:   r.firstName,
    lastName:    r.lastName,
    code:        r.code,
    roleName:    r.roleName ?? null,
    linkedAt:    r.linkedAt.toISOString(),
    assignmentCount: r.assignmentCount ?? 0,
    completedCount: r.completedCount ?? 0,
    lastWorkedAt: r.lastWorkedAt ?? null,
  }));
}

export async function listPersonnelOptions(): Promise<PersonnelOption[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id:        personnelTable.id,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
      code:      personnelTable.code,
      roleName:  rolesTable.name,
    })
    .from(personnelTable)
    .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
    .where(and(eq(personnelTable.tenantId, tenantId), eq(personnelTable.isActive, true)))
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  return rows.map((r) => ({
    id:        r.id,
    firstName: r.firstName,
    lastName:  r.lastName,
    code:      r.code,
    roleName:  r.roleName ?? null,
  }));
}

export async function linkObjectPersonnel(
  objectId: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const [scope, personnel] = await Promise.all([
    getObjectScope(objectId),
    db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
      .limit(1),
  ]);
  if (!scope || scope.tenantId !== tenantId || !personnel[0]) {
    return { success: false, message: "Object of medewerker niet gevonden binnen deze tenant." };
  }

  await db
    .insert(objectPersonnelTable)
    .values({ objectId, personnelId })
    .onConflictDoNothing();

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

export async function unlinkObjectPersonnel(
  objectId: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const scope = await getObjectScope(objectId);
  if (!scope || scope.tenantId !== tenantId) {
    return { success: false, message: "Object niet gevonden binnen deze tenant." };
  }

  await db
    .delete(objectPersonnelTable)
    .where(
      and(
        eq(objectPersonnelTable.objectId, objectId),
        eq(objectPersonnelTable.personnelId, personnelId),
      ),
    );

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function buildObjectPayload(data: ObjectFormInput, extra?: { createdBy?: string; tenantId?: string }) {
  return {
    customerId:           data.customerId,
    sectorId:             data.sectorId || null,
    name:                 data.name.trim(),
    address:              data.address?.trim()           || null,
    city:                 data.city?.trim()              || null,
    postalCode:           data.postalCode?.trim()        || null,
    description:          data.description?.trim()       || null,
    contactName:          data.contactName?.trim()       || null,
    contactFunction:      data.contactFunction?.trim()   || null,
    contactPhone:         data.contactPhone?.trim()      || null,
    contactEmail:         data.contactEmail?.trim()      || null,
    serviceType:          data.serviceType?.trim()       || null,
    fixedInstructions:    data.fixedInstructions?.trim() || null,
    specialNotes:         data.specialNotes?.trim()      || null,
    requiredRoles:        data.requiredRoles         ?? [],
    requiredCertificates: data.requiredCertificates  ?? [],
    googlePlace:          data.googlePlace,
    ...(extra ?? {}),
  };
}

export async function createObject(
  data: ObjectFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(and(eq(customersTable.id, data.customerId), eq(customersTable.tenantId, tenantId)))
    .limit(1);
  if (!customer) return { success: false, message: "Klant niet gevonden binnen deze tenant." };

  const payload = buildObjectPayload(data, { createdBy: user.id, tenantId });

  const parsed = insertObjectSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const geocodingState = await buildObjectAddressGeocodePatch(payload);
    const [created] = await db
      .insert(objectsTable)
      .values({ ...parsed.data, ...geocodingState, tenantId })
      .returning({ id: objectsTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "objects",
      resourceId: created!.id,
      metadata:   { name: payload.name, customerId: payload.customerId, geocodingStatus: geocodingState.geocodingStatus },
    });

    revalidatePath("/objects");
    revalidatePath(`/customers/${payload.customerId}`);
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een object met deze code." };
    }
    return { success: false, message: "Object aanmaken mislukt." };
  }
}

export async function updateObject(
  id: string,
  data: ObjectFormInput,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = buildObjectPayload(data);

  const parsed = updateObjectSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const [existing] = await db
      .select({
        customerId:        objectsTable.customerId,
        address:           objectsTable.address,
        postalCode:        objectsTable.postalCode,
        city:              objectsTable.city,
        formattedAddress:  objectsTable.formattedAddress,
        locationSource:    objectsTable.locationSource,
        geocodingStatus:   objectsTable.geocodingStatus,
        latitude:          objectsTable.latitude,
        longitude:         objectsTable.longitude,
      })
      .from(objectsTable)
      .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
      .limit(1);

    if (!existing) return { success: false, message: "Object niet gevonden." };

    const hasAddressInput = Boolean(
      payload.address?.trim() || payload.postalCode?.trim() || payload.city?.trim(),
    );
    const shouldRepairCanonicalLocation =
      hasAddressInput &&
      (!existing.formattedAddress ||
        !existing.locationSource ||
        existing.geocodingStatus === "failed" ||
        !existing.latitude ||
        !existing.longitude);
    const shouldResetGeocoding =
      locationChanged(existing, payload) || shouldRepairCanonicalLocation;
    const geocodingState = shouldResetGeocoding
      ? await buildObjectAddressGeocodePatch(payload)
      : {};

    await db
      .update(objectsTable)
      .set({ ...parsed.data, ...geocodingState, updatedAt: new Date() })
      .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "objects",
      resourceId: id,
      metadata:   { name: payload.name, geocodingReset: shouldResetGeocoding },
    });

    revalidatePath("/objects");
    revalidatePath(`/objects/${id}`);
    revalidatePath(`/customers/${payload.customerId}`);
    if (existing.customerId !== payload.customerId) {
      revalidatePath(`/customers/${existing.customerId}`);
    }
    if (shouldResetGeocoding) {
      await safeRefreshPlanningRoutesForObject({
        tenantId,
        objectId: id,
        reason: "object_location_updated",
        source: "backoffice",
        fromDate: "0001-01-01",
      });
    }
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een object met deze code." };
    }
    return { success: false, message: "Object bijwerken mislukt." };
  }
}

export async function geocodeObjectLocation(
  id: string,
): Promise<ActionResult<{
  status: string;
  latitude: string | null;
  longitude: string | null;
  message: string;
}>> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [object] = await db
    .select({
      id:         objectsTable.id,
      name:       objectsTable.name,
      customerId: objectsTable.customerId,
      address:    objectsTable.address,
      postalCode: objectsTable.postalCode,
      city:       objectsTable.city,
    })
    .from(objectsTable)
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  if (!object) return { success: false, message: "Object niet gevonden." };

  const addressInput = { ...object, country: "NL" };
  if (!hasGeocodableAddress(addressInput)) {
    await db
      .update(objectsTable)
      .set({
        ...geocodingResetForAddress(addressInput),
        updatedAt: new Date(),
      })
      .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

    revalidatePath("/objects");
    revalidatePath(`/objects/${id}`);
    revalidatePath(`/customers/${object.customerId}`);
    await safeRefreshPlanningRoutesForObject({
      tenantId,
      objectId: id,
      reason: "object_location_updated",
      source: "backoffice",
      fromDate: "0001-01-01",
    });
    return {
      success: false,
      message: "Adresgegevens ontbreken. Vul straat, postcode of plaats in.",
    };
  }

  const result = await geocodeAddress(addressInput);
  if (!result.success) {
    await db
      .update(objectsTable)
      .set({
        geocodingProvider: result.provider,
        geocodingStatus: "failed",
        geocodingConfidence: null,
        geocodingError: result.error,
        updatedAt: new Date(),
      })
      .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

    await db.insert(auditLogTable).values({
      tenantId,
      userId:     user.id,
      action:     "geocode_object_location_failed",
      resource:   "objects",
      resourceId: id,
      metadata:   { name: object.name, error: result.error, retryable: result.retryable },
    });

    revalidatePath("/objects");
    revalidatePath(`/objects/${id}`);
    revalidatePath(`/customers/${object.customerId}`);
    return { success: false, message: result.error };
  }

  const latitude = coordinateString(result.latitude);
  const longitude = coordinateString(result.longitude);

  await db
    .update(objectsTable)
    .set({
      latitude,
      longitude,
      geocodedAt: new Date(),
      geocodingProvider: result.provider,
      geocodingStatus: "geocoded",
      geocodingConfidence: confidenceString(result.confidence),
      geocodingError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    tenantId,
    userId:     user.id,
    action:     "geocode_object_location",
    resource:   "objects",
    resourceId: id,
    metadata:   {
      name: object.name,
      provider: result.provider,
      label: result.label,
      confidence: result.confidence,
    },
  });

  revalidatePath("/objects");
  revalidatePath(`/objects/${id}`);
  revalidatePath(`/customers/${object.customerId}`);
  await safeRefreshPlanningRoutesForObject({
    tenantId,
    objectId: id,
    reason: "object_location_updated",
    source: "backoffice",
    fromDate: "0001-01-01",
  });
  return {
    success: true,
    data: {
      status: "geocoded",
      latitude,
      longitude,
      message: "Objectlocatie is bijgewerkt.",
    },
  };
}

export async function setObjectStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [row] = await db
    .select({ customerId: objectsTable.customerId })
    .from(objectsTable)
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  await db
    .update(objectsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "activate" : "deactivate",
    resource:   "objects",
    resourceId: id,
    metadata:   {},
  });

  revalidatePath("/objects");
  revalidatePath(`/objects/${id}`);
  if (row?.customerId) revalidatePath(`/customers/${row.customerId}`);
  return { success: true };
}

export async function deleteObject(id: string): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [obj] = await db
    .select({ name: objectsTable.name, customerId: objectsTable.customerId })
    .from(objectsTable)
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  if (!obj) return { success: false, message: "Object niet gevonden." };

  await db.delete(objectsTable).where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "objects",
    resourceId: id,
    metadata:   { name: obj.name, customerId: obj.customerId },
  });

  revalidatePath("/objects");
  revalidatePath(`/customers/${obj.customerId}`);
  return { success: true };
}

export async function bulkSetObjectStatus(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (!ids.length) return { success: true };
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(objectsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(and(inArray(objectsTable.id, ids), eq(objectsTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "bulk_activate" : "bulk_deactivate",
    resource:   "objects",
    resourceId: null,
    metadata:   { ids, count: ids.length },
  });

  revalidatePath("/objects");
  return { success: true };
}
