"use server";

import { db } from "@workspace/db";
import {
  personnelTable,
  rolesTable,
  sectorsTable,
  auditLogTable,
  objectPersonnelTable,
  objectsTable,
  customersTable,
  insertPersonnelSchema,
  PERSONNEL_VEHICLE_TYPES,
  updatePersonnelSchema,
  availabilityWindowsTable,
  leavePeriodsTable,
} from "@workspace/db";
import { geocodeAddress, hasGeocodableAddress } from "@workspace/db/address-geocoding";
import { eq, ilike, or, and, asc, desc, inArray, sql } from "drizzle-orm";
import { getBatchAvailabilityStatus } from "./availability";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { provisionPortalUserWithTemporaryPassword } from "@/lib/auth/portal-invites";
import {
  buildTemporaryPasswordEmail,
  personeelPortalUrl,
  sendEmailWithResult,
} from "@/lib/email";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
import { toPlatformPersonnelMaskedDto } from "@/lib/security/safe-dtos";
import type { ActionResult } from "./customers";
import type { ContractInfo, CertificateEntry } from "@/types/personnel";
import type { PersonnelVehicleType } from "@workspace/db";
import { safeRefreshPlanningRoutesForPersonnel } from "@/lib/planning/route-refresh";

// Extract just the names from a CertificateEntry[] (handles legacy string[] too)
function extractCertNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    if (typeof c === "string") return [c];
    if (c && typeof c === "object" && "name" in c) return [String((c as CertificateEntry).name)];
    return [];
  });
}

function normalizePersonnelVehicleType(value: unknown): PersonnelVehicleType | undefined {
  if (typeof value !== "string") return undefined;
  return (PERSONNEL_VEHICLE_TYPES as readonly string[]).includes(value)
    ? (value as PersonnelVehicleType)
    : undefined;
}

function coordinateNumericValue(value: number): string {
  return value.toFixed(6);
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | null {
  const text = value?.trim() ?? "";
  return text ? text.slice(0, maxLength) : null;
}

async function buildPersonnelAddressGeocodePatch(input: {
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string;
}) {
  const addressInput = {
    address: input.addressStreet,
    postalCode: input.addressPostalCode,
    city: input.addressCity,
    country: input.addressCountry,
  };

  if (!hasGeocodableAddress(addressInput)) {
    return {
      addressLatitude: null,
      addressLongitude: null,
      addressGeocodedAt: null,
      addressGeocodingProvider: null,
      addressGeocodingStatus: "not_required",
      addressGeocodingConfidence: null,
      addressGeocodingError: null,
    };
  }

  const result = await geocodeAddress(addressInput);
  if (!result.success) {
    return {
      addressLatitude: null,
      addressLongitude: null,
      addressGeocodedAt: null,
      addressGeocodingProvider: result.provider,
      addressGeocodingStatus: "failed",
      addressGeocodingConfidence: null,
      addressGeocodingError: result.error,
    };
  }

  return {
    addressLatitude: coordinateNumericValue(result.latitude),
    addressLongitude: coordinateNumericValue(result.longitude),
    addressGeocodedAt: new Date(),
    addressGeocodingProvider: result.provider,
    addressGeocodingStatus: "geocoded",
    addressGeocodingConfidence: result.confidence.toFixed(2),
    addressGeocodingError: null,
  };
}

export type { ActionResult };
export type { AvailabilityStatus } from "./availability";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleOption = { id: string; name: string };
export type SectorOption = { id: string; name: string };

/**
 * Auth-account status for a personnel member:
 * - none     — no invite sent, no account
 * - invited  — temporary password sent, password change still required
 * - active   — account exists and is not banned
 * - disabled — account exists but is banned in Supabase Auth
 */
export type PersonnelAuthStatus = "none" | "invited" | "active" | "disabled";

/**
 * Personnel names are internal management data.
 * Customer-role users do NOT have personnel:read permission, so they can never
 * call these server actions or access personnel routes.
 * This is enforced at the action level via requirePermission("personnel", "read").
 */
export type PersonnelRow = {
  id:           string;
  code:         string;
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string | null;
  addressStreet:     string | null;
  addressPostalCode: string | null;
  addressCity:       string | null;
  addressCountry:    string;
  addressGeocodingStatus: string;
  addressGeocodingError: string | null;
  roleId:       string | null;
  roleName:     string | null;
  sectorId:     string | null;
  sectorName:   string | null;
  region:       string | null;
  certificates: string[];
  isActive:           boolean;
  isAvailable:        boolean;
  availabilityStatus: import("./availability").AvailabilityStatus;
  userId:       string | null;
  inviteSentAt: string | null;
  createdAt:    string;
  personnelType:     string | null;
  emergencyAvailable: boolean;
  preferredRegions:   string[];
};

export type PersonnelDetail = {
  id:           string;
  code:         string;
  userId:       string | null;
  inviteSentAt: string | null;
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string | null;
  addressStreet:     string | null;
  addressPostalCode: string | null;
  addressCity:       string | null;
  addressCountry:    string;
  addressGeocodingStatus: string;
  addressGeocodingError: string | null;
  roleId:       string | null;
  roleName:     string | null;
  sectorId:     string | null;
  sectorName:   string | null;
  region:       string | null;
  /** Full certificate entries — preserves expires_at for the edit form */
  certificates: CertificateEntry[];
  diplomas:     string[];
  knowledge:    string[];
  isActive:     boolean;
  isAvailable:  boolean;
  createdAt:    string;
  updatedAt:    string;
  personnelType:       string | null;
  emergencyAvailable:  boolean;
  preferredRegions:    string[];
  contractInfo:        ContractInfo | null;
};

export type PersonnelFormInput = {
  firstName:    string;
  lastName:     string;
  email:        string;
  phone?:       string;
  addressStreet?:     string;
  addressPostalCode?: string;
  addressCity?:       string;
  addressCountry?:    string;
  roleId?:      string;
  sectorId?:    string;
  region?:      string;
  /** Full certificate entries — preserves expires_at on round-trip edits */
  certificates: CertificateEntry[];
  diplomas:     string[];
  knowledge:    string[];
  isAvailable:  boolean;
  isActive:     boolean;
  /** Create-mode only: send invite immediately after record is created. */
  autoInvite?:  boolean;
  personnelType?:      string;
  emergencyAvailable?: boolean;
  preferredRegions?:   string[];
  contractInfo?:       ContractInfo | null;
};

export type PersonnelStats = {
  active:             number;
  flexCount:          number;
  availableToday:     number;
  pendingLeave:       number;
  totalCertificates:  number;
  expiringSoon:       number;
};

export type FlexpoolRow = {
  id:            string;
  firstName:     string;
  lastName:      string;
  roleName:      string | null;
  region:        string | null;
  personnelType: string | null;
  certificates:  string[];
  certCount:     number;
  matchPct:      number;
};

export type CapacityByRoleRow = {
  roleId:         string;
  roleName:       string;
  total:          number;
  availableToday: number;
};

export type LinkedObject = {
  objectId:     string;
  objectCode:   string;
  objectName:   string;
  customerId:   string;
  customerName: string;
  city:         string | null;
  linkedAt:     string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

async function sendPersonnelTemporaryPasswordInvite(person: {
  firstName: string;
  lastName:  string;
  email:     string;
  tenantId:  string;
}): Promise<{ userId: string; created: boolean }> {
  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const invite = await provisionPortalUserWithTemporaryPassword({
    email: person.email,
    fullName,
    portal: "personnel",
  });

  const { subject, html } = buildTemporaryPasswordEmail({
    recipientName:     person.firstName || fullName,
    portalName:        "Personeelsportaal",
    loginUrl:          personeelPortalUrl(),
    temporaryPassword: invite.temporaryPassword,
  });

  const sent = await sendEmailWithResult({
    to: person.email,
    subject,
    html,
    tenantId: person.tenantId,
    purpose: "personnel_portal_invite",
  });

  if (!sent.success) {
    throw new Error(sent.error ?? "Uitnodigingsmail versturen mislukt.");
  }

  return { userId: invite.user.id, created: invite.created };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listPersonnel(params: {
  search?:        string;
  roleId?:        string;
  region?:        string;
  status?:        string;
  personnelType?: string;
  sectorId?:      string;
  page?:          number;
  sort?:          string;
  dir?:           string;
}): Promise<{ rows: PersonnelRow[]; total: number }> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_staff_employees",
    accessLevel: "masked_read",
    resourceType: "personnel",
    metadata: { operation: "listPersonnel" },
  });

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

  const conditions: ReturnType<typeof eq>[] = [
    eq(personnelTable.tenantId, tenantId) as ReturnType<typeof eq>,
  ];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(personnelTable.firstName, term),
      ilike(personnelTable.lastName,  term),
      ilike(personnelTable.email,     term),
      ilike(personnelTable.code,      term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (roleId) conditions.push(eq(personnelTable.roleId, roleId) as ReturnType<typeof eq>);
  if (sectorId) conditions.push(eq(personnelTable.sectorId, sectorId) as ReturnType<typeof eq>);
  if (region?.trim()) conditions.push(ilike(personnelTable.region, `%${region.trim()}%`) as ReturnType<typeof eq>);
  if (status === "active")   conditions.push(eq(personnelTable.isActive, true)  as ReturnType<typeof eq>);
  if (status === "inactive") conditions.push(eq(personnelTable.isActive, false) as ReturnType<typeof eq>);
  if (personnelType) conditions.push(eq(personnelTable.personnelType, personnelType) as ReturnType<typeof eq>);

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    lastName:  personnelTable.lastName,
    firstName: personnelTable.firstName,
    email:     personnelTable.email,
    code:      personnelTable.code,
    region:    personnelTable.region,
    createdAt: personnelTable.createdAt,
  };
  const sortCol = (sortMap[sort] ?? personnelTable.lastName) as typeof personnelTable.lastName;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:                 personnelTable.id,
        code:               personnelTable.code,
        firstName:          personnelTable.firstName,
        lastName:           personnelTable.lastName,
        email:              personnelTable.email,
        phone:              personnelTable.phone,
        addressStreet:      personnelTable.addressStreet,
        addressPostalCode:  personnelTable.addressPostalCode,
        addressCity:        personnelTable.addressCity,
        addressCountry:     personnelTable.addressCountry,
        addressGeocodingStatus: personnelTable.addressGeocodingStatus,
        addressGeocodingError:  personnelTable.addressGeocodingError,
        roleId:             personnelTable.roleId,
        roleName:           rolesTable.name,
        sectorId:           personnelTable.sectorId,
        sectorName:         sectorsTable.name,
        region:             personnelTable.region,
        certificates:       personnelTable.certificates,
        isActive:           personnelTable.isActive,
        isAvailable:        personnelTable.isAvailable,
        userId:             personnelTable.userId,
        inviteSentAt:       personnelTable.inviteSentAt,
        createdAt:          personnelTable.createdAt,
        personnelType:      personnelTable.personnelType,
        emergencyAvailable: personnelTable.emergencyAvailable,
        preferredRegions:   personnelTable.preferredRegions,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(personnelTable)
      .where(where),
  ]);

  const today     = new Date().toISOString().slice(0, 10);
  const ids       = rows.map((r) => r.id);
  const statusMap = await getBatchAvailabilityStatus(ids, today);

  return {
    rows: rows.map((r) => toPlatformPersonnelMaskedDto({
      ...r,
      createdAt:          r.createdAt.toISOString(),
      inviteSentAt:       r.inviteSentAt ? r.inviteSentAt.toISOString() : null,
      availabilityStatus: statusMap[r.id] ?? "niet_ingesteld",
      certificates:       extractCertNames(r.certificates),
      preferredRegions:   (r.preferredRegions as string[]) ?? [],
    }, sensitiveDecision)),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getPersonnel(id: string): Promise<PersonnelDetail | null> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_staff_employees",
    accessLevel: "masked_read",
    resourceType: "personnel",
    resourceId: id,
  });

  const rows = await db
    .select({
      id:                 personnelTable.id,
      code:               personnelTable.code,
      userId:             personnelTable.userId,
      inviteSentAt:       personnelTable.inviteSentAt,
      firstName:          personnelTable.firstName,
      lastName:           personnelTable.lastName,
      email:              personnelTable.email,
      phone:              personnelTable.phone,
      addressStreet:      personnelTable.addressStreet,
      addressPostalCode:  personnelTable.addressPostalCode,
      addressCity:        personnelTable.addressCity,
      addressCountry:     personnelTable.addressCountry,
      addressGeocodingStatus: personnelTable.addressGeocodingStatus,
      addressGeocodingError:  personnelTable.addressGeocodingError,
      roleId:             personnelTable.roleId,
      roleName:           rolesTable.name,
      sectorId:           personnelTable.sectorId,
      sectorName:         sectorsTable.name,
      region:             personnelTable.region,
      certificates:       personnelTable.certificates,
      diplomas:           personnelTable.diplomas,
      knowledge:          personnelTable.knowledge,
      isActive:           personnelTable.isActive,
      isAvailable:        personnelTable.isAvailable,
      createdAt:          personnelTable.createdAt,
      updatedAt:          personnelTable.updatedAt,
      personnelType:      personnelTable.personnelType,
      emergencyAvailable: personnelTable.emergencyAvailable,
      preferredRegions:   personnelTable.preferredRegions,
      contractInfo:       personnelTable.contractInfo,
    })
    .from(personnelTable)
    .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
    .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  const detail: PersonnelDetail = {
    ...r,
    inviteSentAt:     r.inviteSentAt ? r.inviteSentAt.toISOString() : null,
    createdAt:        r.createdAt.toISOString(),
    updatedAt:        r.updatedAt.toISOString(),
    // Return full CertificateEntry[] so the edit form can preserve expires_at
    certificates:     ((r.certificates ?? []) as CertificateEntry[]),
    diplomas:         (r.diplomas  as string[]) ?? [],
    knowledge:        (r.knowledge as string[]) ?? [],
    preferredRegions: (r.preferredRegions as string[]) ?? [],
    contractInfo:     (r.contractInfo as ContractInfo | null) ?? null,
  };
  return toPlatformPersonnelMaskedDto(detail, sensitiveDecision);
}

export async function listRoles(): Promise<RoleOption[]> {
  await requirePermission("personnel", "read");
  return db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));
}

export async function listSectors(): Promise<SectorOption[]> {
  await requirePermission("personnel", "read");
  return db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

// ─── Stats & Widgets ──────────────────────────────────────────────────────────

export async function getPersonnelStats(): Promise<PersonnelStats> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const today      = new Date().toISOString().slice(0, 10);
  const dayOfWeek  = new Date(today + "T00:00:00").getDay();

  const [counts] = await db.select({
    active:    sql<number>`count(*) filter (where ${personnelTable.isActive} = true)::int`,
    flexCount: sql<number>`count(*) filter (
      where ${personnelTable.isActive} = true
        and ${personnelTable.personnelType} in ('flex', 'oproep', 'zzp', 'tijdelijk')
    )::int`,
  }).from(personnelTable).where(eq(personnelTable.tenantId, tenantId));

  const [availRow] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(personnelTable)
  .where(
    and(
      eq(personnelTable.isActive, true),
      eq(personnelTable.tenantId, tenantId),
      eq(personnelTable.isAvailable, true),
      sql`exists (
        select 1 from availability_windows aw
        where aw.personnel_id = ${personnelTable.id}
          and aw.day_of_week = ${dayOfWeek}
      )`,
      sql`not exists (
        select 1 from leave_periods lp
        where lp.personnel_id = ${personnelTable.id}
          and lp.status = 'approved'
          and lp.start_date <= ${today}
          and (lp.end_date >= ${today} or lp.end_date is null)
      )`,
    ),
  );

  const [leaveRow] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(leavePeriodsTable)
  .innerJoin(personnelTable, eq(leavePeriodsTable.personnelId, personnelTable.id))
  .where(and(eq(leavePeriodsTable.status, "pending"), eq(personnelTable.tenantId, tenantId)));

  // Total + expiring certificates (uses {name, expires_at} format from migration 025)
  const [certRow] = await db.select({
    total: sql<number>`coalesce(sum(jsonb_array_length(${personnelTable.certificates})), 0)::int`,
  })
  .from(personnelTable)
  .where(and(eq(personnelTable.tenantId, tenantId), eq(personnelTable.isActive, true)));

  const expirySoonResult = await db.execute<{ expiring_soon: string | number }>(sql`
    select coalesce((
      select count(*)::int
      from personnel p2,
           jsonb_array_elements(p2.certificates) as cert
      where p2.tenant_id = ${tenantId}::uuid
        and p2.is_active = true
        and (cert->>'expires_at') is not null
        and (cert->>'expires_at')::date between current_date and current_date + interval '30 days'
    ), 0) as expiring_soon
  `);
  const expiringSoon = Number((expirySoonResult.rows[0] as { expiring_soon: string | number })?.expiring_soon ?? 0);

  return {
    active:            counts?.active      ?? 0,
    flexCount:         counts?.flexCount   ?? 0,
    availableToday:    availRow?.count     ?? 0,
    pendingLeave:      leaveRow?.count     ?? 0,
    totalCertificates: certRow?.total      ?? 0,
    expiringSoon,
  };
}

export async function getFlexpoolToday(): Promise<FlexpoolRow[]> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date(today + "T00:00:00").getDay();

  const allRows = await db.select({
    id:            personnelTable.id,
    firstName:     personnelTable.firstName,
    lastName:      personnelTable.lastName,
    roleName:      rolesTable.name,
    region:        personnelTable.region,
    personnelType: personnelTable.personnelType,
    certificates:  personnelTable.certificates,
    certCount:     sql<number>`jsonb_array_length(${personnelTable.certificates})::int`,
  })
  .from(personnelTable)
  .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
  .where(
    and(
      eq(personnelTable.isActive, true),
      eq(personnelTable.tenantId, tenantId),
      eq(personnelTable.isAvailable, true),
      sql`${personnelTable.personnelType} in ('flex', 'oproep', 'zzp', 'tijdelijk')`,
      sql`exists (
        select 1 from availability_windows aw
        where aw.personnel_id = ${personnelTable.id}
          and aw.day_of_week = ${dayOfWeek}
      )`,
      sql`not exists (
        select 1 from leave_periods lp
        where lp.personnel_id = ${personnelTable.id}
          and lp.status = 'approved'
          and lp.start_date <= ${today}
          and (lp.end_date >= ${today} or lp.end_date is null)
      )`,
    ),
  );

  // Sort by certCount desc, take top 3, compute matchPct relative to the highest in the pool
  const maxCerts = allRows.reduce((m, r) => Math.max(m, r.certCount ?? 0), 0);
  const top3 = allRows
    .sort((a, b) => (b.certCount ?? 0) - (a.certCount ?? 0))
    .slice(0, 3);

  return top3.map((r) => ({
    ...r,
    certificates: extractCertNames(r.certificates),
    certCount:    r.certCount ?? 0,
    matchPct:     Math.round(((r.certCount ?? 0) / Math.max(maxCerts, 1)) * 100),
  }));
}

export async function getCapacityByRole(): Promise<CapacityByRoleRow[]> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date(today + "T00:00:00").getDay();

  const rows = await db.select({
    roleId:   rolesTable.id,
    roleName: rolesTable.name,
    total:    sql<number>`count(*)::int`,
    availableToday: sql<number>`count(*) filter (
      where ${personnelTable.isAvailable} = true
      and exists (
        select 1 from availability_windows aw
        where aw.personnel_id = ${personnelTable.id}
          and aw.day_of_week = ${dayOfWeek}
      )
      and not exists (
        select 1 from leave_periods lp
        where lp.personnel_id = ${personnelTable.id}
          and lp.status = 'approved'
          and lp.start_date <= ${today}
          and (lp.end_date >= ${today} or lp.end_date is null)
      )
    )::int`,
  })
  .from(personnelTable)
  .innerJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
  .where(and(eq(personnelTable.tenantId, tenantId), eq(personnelTable.isActive, true)))
  .groupBy(rolesTable.id, rolesTable.name)
  .orderBy(desc(sql`count(*)`))
  .limit(8);

  return rows;
}

export async function getLinkedObjects(personnelId: string): Promise<LinkedObject[]> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db.select({
    objectId:     objectsTable.id,
    objectCode:   objectsTable.code,
    objectName:   objectsTable.name,
    customerId:   customersTable.id,
    customerName: customersTable.name,
    city:         objectsTable.city,
    linkedAt:     objectPersonnelTable.linkedAt,
  })
  .from(objectPersonnelTable)
  .innerJoin(objectsTable,    eq(objectPersonnelTable.objectId,    objectsTable.id))
  .innerJoin(customersTable,  eq(objectsTable.customerId,          customersTable.id))
  .where(and(eq(objectPersonnelTable.personnelId, personnelId), eq(customersTable.tenantId, tenantId)))
  .orderBy(asc(objectsTable.name));

  return rows.map((r) => ({
    ...r,
    linkedAt: r.linkedAt.toISOString(),
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPersonnel(
  data: PersonnelFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    firstName:          data.firstName.trim(),
    lastName:           data.lastName.trim(),
    email:              data.email.trim().toLowerCase(),
    phone:              data.phone?.trim()  || null,
    addressStreet:      normalizeOptionalText(data.addressStreet, 200),
    addressPostalCode:  normalizeOptionalText(data.addressPostalCode, 20),
    addressCity:        normalizeOptionalText(data.addressCity, 120),
    addressCountry:     normalizeOptionalText(data.addressCountry, 80) ?? "Nederland",
    roleId:             data.roleId         || null,
    sectorId:           data.sectorId       || null,
    region:             data.region?.trim() || null,
    certificates:       data.certificates,
    diplomas:           data.diplomas,
    knowledge:          data.knowledge,
    isAvailable:        data.isAvailable,
    isActive:           data.isActive,
    personnelType:      data.personnelType  || null,
    emergencyAvailable: data.emergencyAvailable ?? false,
    preferredRegions:   data.preferredRegions ?? [],
    contractInfo:       data.contractInfo   ?? null,
  };

  const parsed = insertPersonnelSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const { vehicleType: parsedVehicleType, ...parsedInsertData } = parsed.data;
    const vehicleType = normalizePersonnelVehicleType(parsedVehicleType);
    if (parsedVehicleType && !vehicleType) {
      return { success: false, message: "Ongeldig vervoerstype." };
    }
    const addressGeocodePatch = await buildPersonnelAddressGeocodePatch({
      addressStreet: payload.addressStreet,
      addressPostalCode: payload.addressPostalCode,
      addressCity: payload.addressCity,
      addressCountry: payload.addressCountry,
    });
    const insertData = {
      ...parsedInsertData,
      ...(vehicleType ? { vehicleType } : {}),
      ...addressGeocodePatch,
      // data.certificates is already CertificateEntry[] — preserve expires_at values
      certificates: data.certificates as unknown as { name: string; expires_at?: string }[],
      contractInfo: (parsed.data.contractInfo ?? null) as ContractInfo | null,
    };
    const [created] = await db
      .insert(personnelTable)
      .values({ ...insertData, tenantId })
      .returning({ id: personnelTable.id });

    const createdId = created!.id;

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "personnel",
      resourceId: createdId,
      metadata:   { name: `${payload.firstName} ${payload.lastName}` },
    });

    // Auto-invite: send the portal invite immediately after creating the record
    if (data.autoInvite) {
      try {
        const invite = await sendPersonnelTemporaryPasswordInvite({
          firstName: payload.firstName,
          lastName:  payload.lastName,
          email:     payload.email,
          tenantId,
        });
        await db
          .update(personnelTable)
          .set({ userId: invite.userId, inviteSentAt: new Date(), updatedAt: new Date() })
          .where(eq(personnelTable.id, createdId));

        await db.insert(auditLogTable).values({
          userId:     user.id,
          action:     "auto_invite_personnel",
          resource:   "personnel",
          resourceId: createdId,
          metadata:   {
            name: `${payload.firstName} ${payload.lastName}`,
            email: payload.email,
            temporaryPassword: true,
            authUserCreated: invite.created,
          },
        });
      } catch (inviteError) {
        console.error("[personnel] Auto-invite failed:", inviteError);
      }
      // If the invite fails, the record is still created — failure is not surfaced
      // so the caller can navigate to the detail page and invite manually.
    }

    revalidatePath("/personnel");
    return { success: true, data: { id: createdId } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een medewerker met dit e-mailadres.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Medewerker aanmaken mislukt." };
  }
}

export async function updatePersonnel(
  id: string,
  data: PersonnelFormInput,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    firstName:          data.firstName.trim(),
    lastName:           data.lastName.trim(),
    email:              data.email.trim().toLowerCase(),
    phone:              data.phone?.trim()  || null,
    addressStreet:      normalizeOptionalText(data.addressStreet, 200),
    addressPostalCode:  normalizeOptionalText(data.addressPostalCode, 20),
    addressCity:        normalizeOptionalText(data.addressCity, 120),
    addressCountry:     normalizeOptionalText(data.addressCountry, 80) ?? "Nederland",
    roleId:             data.roleId         || null,
    sectorId:           data.sectorId       || null,
    region:             data.region?.trim() || null,
    certificates:       data.certificates,
    diplomas:           data.diplomas,
    knowledge:          data.knowledge,
    isAvailable:        data.isAvailable,
    isActive:           data.isActive,
    personnelType:      data.personnelType  || null,
    emergencyAvailable: data.emergencyAvailable ?? false,
    preferredRegions:   data.preferredRegions ?? [],
    contractInfo:       data.contractInfo   ?? null,
  };

  const parsed = updatePersonnelSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const { vehicleType: parsedVehicleType, ...parsedUpdateData } = parsed.data;
    const vehicleType = normalizePersonnelVehicleType(parsedVehicleType);
    if (parsedVehicleType && !vehicleType) {
      return { success: false, message: "Ongeldig vervoerstype." };
    }
    const addressGeocodePatch = await buildPersonnelAddressGeocodePatch({
      addressStreet: payload.addressStreet,
      addressPostalCode: payload.addressPostalCode,
      addressCity: payload.addressCity,
      addressCountry: payload.addressCountry,
    });
    const updateData = {
      ...parsedUpdateData,
      ...(vehicleType ? { vehicleType } : {}),
      ...addressGeocodePatch,
      // data.certificates is already CertificateEntry[] — preserve expires_at values
      certificates: data.certificates as unknown as { name: string; expires_at?: string }[],
      contractInfo: (parsed.data.contractInfo ?? null) as ContractInfo | null,
      updatedAt: new Date(),
    };
    await db
      .update(personnelTable)
      .set(updateData)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "personnel",
      resourceId: id,
      metadata:   { name: `${payload.firstName} ${payload.lastName}` },
    });

    revalidatePath("/personnel");
    revalidatePath(`/personnel/${id}`);
    await safeRefreshPlanningRoutesForPersonnel({
      tenantId,
      personnelId: id,
      reason: "personnel_home_address_updated",
      source: "backoffice",
      fromDate: "0001-01-01",
    });
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een medewerker met dit e-mailadres.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Medewerker bijwerken mislukt." };
  }
}

export async function setPersonnelStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(personnelTable)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "activate" : "deactivate",
    resource:   "personnel",
    resourceId: id,
    metadata:   {},
  });

  revalidatePath("/personnel");
  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

export async function bulkSetPersonnelStatus(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (!ids.length) return { success: true };
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(personnelTable)
    .set({ isActive, updatedAt: new Date() })
    .where(and(inArray(personnelTable.id, ids), eq(personnelTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "bulk_activate" : "bulk_deactivate",
    resource:   "personnel",
    resourceId: null,
    metadata:   { ids, count: ids.length },
  });

  revalidatePath("/personnel");
  return { success: true };
}

export async function invitePersonnel(id: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user: actor } } = await supabase.auth.getUser();
  if (!actor) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
      email:        personnelTable.email,
      userId:       personnelTable.userId,
      inviteSentAt: personnelTable.inviteSentAt,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (person.userId) {
    const authStatus = await getPersonnelAuthStatus(id);
    if (authStatus === "active") {
      return { success: false, message: "Medewerker heeft al een actief portaalaccount." };
    }
  }

  let temporaryInvite: { userId: string; created: boolean };
  try {
    temporaryInvite = await sendPersonnelTemporaryPasswordInvite({ ...person, tenantId });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Uitnodiging versturen mislukt.",
    };
  }

  await db
    .update(personnelTable)
    .set({ userId: temporaryInvite.userId, inviteSentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     actor.id,
    action:     "invite",
    resource:   "personnel",
    resourceId: id,
    metadata:   {
      name: `${person.firstName} ${person.lastName}`,
      email: person.email,
      temporaryPassword: true,
      authUserCreated: temporaryInvite.created,
    },
  });

  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

// ─── Auth-status query ────────────────────────────────────────────────────────

/**
 * Derives the portal auth-status for a personnel member.
 * Falls back to "active" if the Admin API call fails, so the UI never hides
 * a functional account just because of a transient API error.
 */
export async function getPersonnelAuthStatus(id: string): Promise<PersonnelAuthStatus> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const [person] = await db
    .select({ userId: personnelTable.userId, inviteSentAt: personnelTable.inviteSentAt })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return "none";
  if (!person.userId) return person.inviteSentAt ? "invited" : "none";

  // userId is set — verify via Admin API whether the account is still active.
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(person.userId);
    if (error || !data?.user) return "active";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = data.user as any;
    const bannedUntil: string | null | undefined = u.banned_until;
    // Supabase sets banned_until to "none" when the ban is lifted; any future ISO date = banned.
    if (bannedUntil && bannedUntil !== "none" && new Date(bannedUntil) > new Date()) {
      return "disabled";
    }
    if (u.deleted_at) return "disabled";
    if (data.user.app_metadata?.force_password_change === true) return "invited";
    return "active";
  } catch {
    return "active"; // safe fallback — never hide a potentially active account
  }
}

// ─── Email-only update (pre-invite) ──────────────────────────────────────────

/**
 * Allows management to correct the invite e-mail before the first invite is sent.
 * Blocked when a userId is already linked (account is active — reset access through user management).
 */
export async function updatePersonnelEmail(
  id:    string,
  email: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { success: false, message: "Ongeldig e-mailadres." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ userId: personnelTable.userId })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (person.userId) {
    return {
      success: false,
      message: "E-mailadres kan niet worden gewijzigd van een account dat al actief is. Gebruik gebruikersbeheer voor toegang of reset.",
    };
  }

  try {
    await db
      .update(personnelTable)
      .set({ email: trimmed, updatedAt: new Date() })
      .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update_email",
      resource:   "personnel",
      resourceId: id,
      metadata:   { email: trimmed },
    });

    revalidatePath(`/personnel/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message:     "Dit e-mailadres is al in gebruik bij een andere medewerker.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "E-mailadres bijwerken mislukt." };
  }
}

/**
 * Ban or unban a personnel member's Supabase Auth account.
 * - ban:   sets ban_duration = '876600h' (~100 years — effectively permanent)
 * - unban: sets ban_duration = 'none'
 * Logs `ban_personnel_account` or `unban_personnel_account` in the audit log.
 */
export async function setPersonnelAuthBan(
  id:     string,
  banned: boolean,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({
      userId:    personnelTable.userId,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (!person.userId) {
    return { success: false, message: "Medewerker heeft geen portaalaccount. Stuur eerst een uitnodiging." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(person.userId, {
    ban_duration: banned ? "876600h" : "none",
  });

  if (error) {
    return { success: false, message: error.message ?? "Account blokkeren mislukt." };
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     banned ? "ban_personnel_account" : "unban_personnel_account",
    resource:   "personnel",
    resourceId: id,
    metadata:   { name: `${person.firstName} ${person.lastName}` },
  });

  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

export async function deletePersonnel(id: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ firstName: personnelTable.firstName, lastName: personnelTable.lastName })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };

  await db.delete(personnelTable).where(and(eq(personnelTable.id, id), eq(personnelTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "personnel",
    resourceId: id,
    metadata:   { name: `${person.firstName} ${person.lastName}` },
  });

  revalidatePath("/personnel");
  return { success: true };
}
