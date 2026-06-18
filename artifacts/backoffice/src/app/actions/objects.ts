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
  documentsTable,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
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
  description: string | null;
  contactName: string | null;
  contactFunction: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  serviceType: string | null;
  accessInfo: string | null;
  keyInfo: string | null;
  alarmInfo: string | null;
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
  accessInfo?: string;
  keyInfo?: string;
  alarmInfo?: string;
  fixedInstructions?: string;
  specialNotes?: string;
  requiredRoles?: string[];
  requiredCertificates?: string[];
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
};

export type PersonnelOption = {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  roleName: string | null;
};

export type ObjectStats = {
  total: number;
  active: number;
  activeAssignments: number;
  periodicTasks: number;
  openAlerts: number;
  contracts: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── Subquery: next scheduled service date for an object ──────────────────────

const nextServiceSql = sql<string | null>`(
  SELECT TO_CHAR(a.scheduled_date, 'YYYY-MM-DD')
  FROM assignments a
  WHERE a.object_id = ${objectsTable.id}
    AND a.scheduled_date >= CURRENT_DATE
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

  const conditions: ReturnType<typeof eq>[] = [];
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

  try {
    const [totalRow, activeRow, assignmentRow, serviceTypeRow, inactiveRow, documentRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(objectsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(objectsTable).where(eq(objectsTable.isActive, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(assignmentsTable)
        .where(sql`${assignmentsTable.objectId} IS NOT NULL AND ${assignmentsTable.status} IN ('scheduled', 'in_progress', 'seen', 'plannable', 'approved')`),
      db.select({ count: sql<number>`count(DISTINCT ${objectsTable.serviceType})::int` }).from(objectsTable)
        .where(sql`${objectsTable.serviceType} IS NOT NULL AND trim(${objectsTable.serviceType}) <> ''`),
      db.select({ count: sql<number>`count(*)::int` }).from(objectsTable).where(eq(objectsTable.isActive, false)),
      db.select({ count: sql<number>`count(*)::int` }).from(documentsTable)
        .where(eq(documentsTable.entityType, "object")),
    ]);

    return {
      total:             totalRow[0]?.count        ?? 0,
      active:            activeRow[0]?.count       ?? 0,
      activeAssignments: assignmentRow[0]?.count   ?? 0,
      periodicTasks:     serviceTypeRow[0]?.count  ?? 0,
      openAlerts:        inactiveRow[0]?.count     ?? 0,
      contracts:         documentRow[0]?.count     ?? 0,
    };
  } catch (err) {
    console.error("Object statistics failed", err);
    return {
      total: 0,
      active: 0,
      activeAssignments: 0,
      periodicTasks: 0,
      openAlerts: 0,
      contracts: 0,
    };
  }
}

export async function getObject(id: string): Promise<ObjectDetail | null> {
  await requirePermission("objects", "read");

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
      description:          objectsTable.description,
      contactName:          objectsTable.contactName,
      contactFunction:      objectsTable.contactFunction,
      contactPhone:         objectsTable.contactPhone,
      contactEmail:         objectsTable.contactEmail,
      serviceType:          objectsTable.serviceType,
      accessInfo:           objectsTable.accessInfo,
      keyInfo:              objectsTable.keyInfo,
      alarmInfo:            objectsTable.alarmInfo,
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
    .where(eq(objectsTable.id, id))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    requiredRoles:        (r.requiredRoles as string[])        ?? [],
    requiredCertificates: (r.requiredCertificates as string[]) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listObjectsForCustomer(customerId: string): Promise<ObjectRow[]> {
  await requirePermission("objects", "read");

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
    .where(eq(objectsTable.customerId, customerId))
    .orderBy(asc(objectsTable.name));

  return rows.map((r) => ({ ...r, nextServiceDate: r.nextServiceDate ?? null, createdAt: r.createdAt.toISOString() }));
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  await requirePermission("objects", "read");

  return db
    .select({
      id:   customersTable.id,
      name: customersTable.name,
      code: customersTable.code,
    })
    .from(customersTable)
    .where(eq(customersTable.isActive, true))
    .orderBy(asc(customersTable.name));
}

// ─── Object contacts ──────────────────────────────────────────────────────────

export async function listObjectContacts(objectId: string): Promise<ObjectContactRow[]> {
  await requirePermission("objects", "read");

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

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
    .where(eq(objectContactsTable.id, contactId));

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

export async function deleteObjectContact(
  contactId: string,
  objectId: string,
): Promise<ActionResult> {
  await requirePermission("objects", "write");

  await db.delete(objectContactsTable).where(eq(objectContactsTable.id, contactId));

  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

// ─── Object personnel ─────────────────────────────────────────────────────────

export async function listObjectPersonnel(objectId: string): Promise<ObjectPersonnelRow[]> {
  await requirePermission("objects", "read");

  const rows = await db
    .select({
      personnelId: objectPersonnelTable.personnelId,
      firstName:   personnelTable.firstName,
      lastName:    personnelTable.lastName,
      code:        personnelTable.code,
      roleName:    rolesTable.name,
      linkedAt:    objectPersonnelTable.linkedAt,
    })
    .from(objectPersonnelTable)
    .innerJoin(personnelTable, eq(objectPersonnelTable.personnelId, personnelTable.id))
    .leftJoin(rolesTable,      eq(personnelTable.roleId, rolesTable.id))
    .where(eq(objectPersonnelTable.objectId, objectId))
    .orderBy(asc(personnelTable.lastName));

  return rows.map((r) => ({
    personnelId: r.personnelId,
    firstName:   r.firstName,
    lastName:    r.lastName,
    code:        r.code,
    roleName:    r.roleName ?? null,
    linkedAt:    r.linkedAt.toISOString(),
  }));
}

export async function listPersonnelOptions(): Promise<PersonnelOption[]> {
  await requirePermission("objects", "read");

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
    .where(eq(personnelTable.isActive, true))
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

function buildObjectPayload(data: ObjectFormInput, extra?: { createdBy?: string }) {
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
    accessInfo:           data.accessInfo?.trim()        || null,
    keyInfo:              data.keyInfo?.trim()           || null,
    alarmInfo:            data.alarmInfo?.trim()         || null,
    fixedInstructions:    data.fixedInstructions?.trim() || null,
    specialNotes:         data.specialNotes?.trim()      || null,
    requiredRoles:        data.requiredRoles         ?? [],
    requiredCertificates: data.requiredCertificates  ?? [],
    ...(extra ?? {}),
  };
}

export async function createObject(
  data: ObjectFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("objects", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = buildObjectPayload(data, { createdBy: user.id });

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
    const [created] = await db
      .insert(objectsTable)
      .values(parsed.data)
      .returning({ id: objectsTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "objects",
      resourceId: created!.id,
      metadata:   { name: payload.name, customerId: payload.customerId },
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
    await db
      .update(objectsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(objectsTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "objects",
      resourceId: id,
      metadata:   { name: payload.name },
    });

    revalidatePath("/objects");
    revalidatePath(`/objects/${id}`);
    revalidatePath(`/customers/${payload.customerId}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een object met deze code." };
    }
    return { success: false, message: "Object bijwerken mislukt." };
  }
}

export async function setObjectStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("objects", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [row] = await db
    .select({ customerId: objectsTable.customerId })
    .from(objectsTable)
    .where(eq(objectsTable.id, id))
    .limit(1);

  await db
    .update(objectsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(objectsTable.id, id));

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [obj] = await db
    .select({ name: objectsTable.name, customerId: objectsTable.customerId })
    .from(objectsTable)
    .where(eq(objectsTable.id, id))
    .limit(1);

  if (!obj) return { success: false, message: "Object niet gevonden." };

  await db.delete(objectsTable).where(eq(objectsTable.id, id));

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(objectsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(inArray(objectsTable.id, ids));

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
