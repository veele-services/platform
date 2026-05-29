"use server";

import { db } from "@workspace/db";
import {
  objectsTable,
  customersTable,
  sectorsTable,
  auditLogTable,
  insertObjectSchema,
  updateObjectSchema,
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
  code: string | null;
};

export type ObjectRow = {
  id: string;
  customerId: string;
  customerName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  name: string;
  code: string | null;
  city: string | null;
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
  code: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ObjectFormInput = {
  customerId: string;
  sectorId?: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  description?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listObjects(params: {
  search?: string;
  customerId?: string;
  sectorId?: string;
  status?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: ObjectRow[]; total: number }> {
  await requirePermission("objects", "read");

  const {
    search,
    customerId,
    sectorId,
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
  if (customerId) conditions.push(eq(objectsTable.customerId, customerId) as ReturnType<typeof eq>);
  if (sectorId)   conditions.push(eq(objectsTable.sectorId, sectorId)   as ReturnType<typeof eq>);
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
        id:           objectsTable.id,
        customerId:   objectsTable.customerId,
        customerName: customersTable.name,
        sectorId:     objectsTable.sectorId,
        sectorName:   sectorsTable.name,
        name:         objectsTable.name,
        code:         objectsTable.code,
        city:         objectsTable.city,
        isActive:     objectsTable.isActive,
        createdAt:    objectsTable.createdAt,
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
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getObject(id: string): Promise<ObjectDetail | null> {
  await requirePermission("objects", "read");

  const rows = await db
    .select({
      id:           objectsTable.id,
      customerId:   objectsTable.customerId,
      customerName: customersTable.name,
      customerCode: customersTable.code,
      sectorId:     objectsTable.sectorId,
      sectorName:   sectorsTable.name,
      name:         objectsTable.name,
      code:         objectsTable.code,
      address:      objectsTable.address,
      city:         objectsTable.city,
      postalCode:   objectsTable.postalCode,
      description:  objectsTable.description,
      isActive:     objectsTable.isActive,
      createdAt:    objectsTable.createdAt,
      updatedAt:    objectsTable.updatedAt,
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
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listObjectsForCustomer(customerId: string): Promise<ObjectRow[]> {
  await requirePermission("objects", "read");

  const rows = await db
    .select({
      id:           objectsTable.id,
      customerId:   objectsTable.customerId,
      customerName: customersTable.name,
      sectorId:     objectsTable.sectorId,
      sectorName:   sectorsTable.name,
      name:         objectsTable.name,
      code:         objectsTable.code,
      city:         objectsTable.city,
      isActive:     objectsTable.isActive,
      createdAt:    objectsTable.createdAt,
    })
    .from(objectsTable)
    .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
    .leftJoin(sectorsTable,   eq(objectsTable.sectorId,   sectorsTable.id))
    .where(eq(objectsTable.customerId, customerId))
    .orderBy(asc(objectsTable.name));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createObject(
  data: ObjectFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("objects", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Not authenticated." };

  const payload = {
    customerId:  data.customerId,
    sectorId:    data.sectorId    || null,
    name:        data.name.trim(),
    code:        data.code?.trim()        || null,
    address:     data.address?.trim()     || null,
    city:        data.city?.trim()        || null,
    postalCode:  data.postalCode?.trim()  || null,
    description: data.description?.trim() || null,
    createdBy:   user.id,
  };

  const parsed = insertObjectSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
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
      return { success: false, message: "An object with this code already exists." };
    }
    return { success: false, message: "Failed to create object." };
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
  if (!user) return { success: false, message: "Not authenticated." };

  const payload = {
    customerId:  data.customerId,
    sectorId:    data.sectorId    || null,
    name:        data.name.trim(),
    code:        data.code?.trim()        || null,
    address:     data.address?.trim()     || null,
    city:        data.city?.trim()        || null,
    postalCode:  data.postalCode?.trim()  || null,
    description: data.description?.trim() || null,
  };

  const parsed = updateObjectSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
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
    revalidatePath(`/customers/${payload.customerId}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "An object with this code already exists." };
    }
    return { success: false, message: "Failed to update object." };
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
  if (!user) return { success: false, message: "Not authenticated." };

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
  if (row?.customerId) revalidatePath(`/customers/${row.customerId}`);
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
  if (!user) return { success: false, message: "Not authenticated." };

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
