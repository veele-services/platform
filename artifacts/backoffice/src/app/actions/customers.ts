"use server";

import { db } from "@workspace/db";
import {
  customersTable,
  customerNotesTable,
  objectsTable,
  sectorsTable,
  auditLogTable,
  insertCustomerSchema,
  updateCustomerSchema,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type SectorOption = { id: string; name: string };

export type CustomerRow = {
  id: string;
  name: string;
  code: string;
  sectorId: string | null;
  sectorName: string | null;
  city: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  sectorId: string | null;
  sectorName: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFormInput = {
  name: string;
  sectorId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export type CustomerNoteRow = {
  id: string;
  content: string;
  createdAt: string;
  authorEmail: string;
  authorName: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listCustomers(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: CustomerRow[]; total: number }> {
  await requirePermission("customers", "read");

  const {
    search,
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
      ilike(customersTable.name, term),
      ilike(customersTable.code, term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId) conditions.push(eq(customersTable.sectorId, sectorId) as ReturnType<typeof eq>);
  if (status === "active")   conditions.push(eq(customersTable.isActive, true)  as ReturnType<typeof eq>);
  if (status === "inactive") conditions.push(eq(customersTable.isActive, false) as ReturnType<typeof eq>);

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    name:      customersTable.name,
    code:      customersTable.code,
    city:      customersTable.city,
    createdAt: customersTable.createdAt,
  };
  const sortCol = (sortMap[sort] ?? customersTable.name) as typeof customersTable.name;

  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:           customersTable.id,
        name:         customersTable.name,
        code:         customersTable.code,
        sectorId:     customersTable.sectorId,
        sectorName:   sectorsTable.name,
        city:         customersTable.city,
        contactEmail: customersTable.contactEmail,
        isActive:     customersTable.isActive,
        createdAt:    customersTable.createdAt,
      })
      .from(customersTable)
      .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(customersTable)
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  await requirePermission("customers", "read");
  const canSeeNotes = await hasPermission("customers", "write");

  const rows = await db
    .select({
      id:           customersTable.id,
      name:         customersTable.name,
      code:         customersTable.code,
      sectorId:     customersTable.sectorId,
      sectorName:   sectorsTable.name,
      address:      customersTable.address,
      city:         customersTable.city,
      postalCode:   customersTable.postalCode,
      country:      customersTable.country,
      contactName:  customersTable.contactName,
      contactEmail: customersTable.contactEmail,
      contactPhone: customersTable.contactPhone,
      isActive:     customersTable.isActive,
      notes:        customersTable.notes,
      createdAt:    customersTable.createdAt,
      updatedAt:    customersTable.updatedAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
    .where(eq(customersTable.id, id))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    notes:     canSeeNotes ? r.notes : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(objectsTable)
    .where(eq(objectsTable.customerId, id));

  const linkedObjects = countRow?.count ?? 0;
  if (linkedObjects > 0) {
    return {
      success: false,
      message: `Kan niet verwijderen: deze klant heeft ${linkedObjects} object${linkedObjects > 1 ? "en" : ""}. Verwijder eerst alle objecten.`,
    };
  }

  const [customer] = await db
    .select({ name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, id))
    .limit(1);

  if (!customer) return { success: false, message: "Klant niet gevonden." };

  // Remove notes first (no FK cascade on customer_notes)
  await db.delete(customerNotesTable).where(eq(customerNotesTable.customerId, id));
  await db.delete(customersTable).where(eq(customersTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "customers",
    resourceId: id,
    metadata:   { name: customer.name },
  });

  revalidatePath("/customers");
  return { success: true };
}

export async function listSectors(): Promise<SectorOption[]> {
  return db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createCustomer(
  data: CustomerFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    name:         data.name.trim(),
    sectorId:     data.sectorId            || null,
    contactName:  data.contactName?.trim() || null,
    contactEmail: data.contactEmail?.trim()|| null,
    contactPhone: data.contactPhone?.trim()|| null,
    address:      data.address?.trim()     || null,
    city:         data.city?.trim()        || null,
    postalCode:   data.postalCode?.trim()  || null,
    country:      data.country?.trim()     || "NL",
    notes:        data.notes?.trim()       || null,
    createdBy:    user.id,
  };

  const parsed = insertCustomerSchema.safeParse(payload);
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
      .insert(customersTable)
      .values(parsed.data)
      .returning({ id: customersTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "customers",
      resourceId: created!.id,
      metadata:   { name: payload.name },
    });

    revalidatePath("/customers");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een klant met dit e-mailadres.",
        fieldErrors: { contactEmail: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Klant aanmaken mislukt." };
  }
}

export async function updateCustomer(
  id: string,
  data: CustomerFormInput,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    name:         data.name.trim(),
    sectorId:     data.sectorId            || null,
    contactName:  data.contactName?.trim() || null,
    contactEmail: data.contactEmail?.trim()|| null,
    contactPhone: data.contactPhone?.trim()|| null,
    address:      data.address?.trim()     || null,
    city:         data.city?.trim()        || null,
    postalCode:   data.postalCode?.trim()  || null,
    country:      data.country?.trim()     || "NL",
    notes:        data.notes?.trim()       || null,
  };

  const parsed = updateCustomerSchema.safeParse(payload);
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
      .update(customersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(customersTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "customers",
      resourceId: id,
      metadata:   { name: payload.name },
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een klant met dit e-mailadres.",
        fieldErrors: { contactEmail: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Klant bijwerken mislukt." };
  }
}

export async function setCustomerStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(customersTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(customersTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "activate" : "deactivate",
    resource:   "customers",
    resourceId: id,
    metadata:   {},
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function bulkSetCustomerStatus(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (!ids.length) return { success: true };
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(customersTable)
    .set({ isActive, updatedAt: new Date() })
    .where(inArray(customersTable.id, ids));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "bulk_activate" : "bulk_deactivate",
    resource:   "customers",
    resourceId: null,
    metadata:   { ids, count: ids.length },
  });

  revalidatePath("/customers");
  return { success: true };
}

// ─── Customer Notes ────────────────────────────────────────────────────────────

export async function listCustomerNotes(customerId: string): Promise<CustomerNoteRow[]> {
  const canRead = await hasPermission("customers", "write");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:        customerNotesTable.id,
      notes:     customerNotesTable.notes,
      createdAt: customerNotesTable.createdAt,
      updatedBy: customerNotesTable.updatedBy,
    })
    .from(customerNotesTable)
    .where(eq(customerNotesTable.customerId, customerId))
    .orderBy(desc(customerNotesTable.createdAt));

  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, { email: string; name: string | null }>();
  for (const u of data?.users ?? []) {
    const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
    userMap.set(u.id, {
      email: u.email ?? u.id,
      name:  (meta?.full_name ?? meta?.name) ?? null,
    });
  }

  return rows.map((r) => {
    const author = r.updatedBy ? userMap.get(r.updatedBy) : undefined;
    return {
      id:          r.id,
      content:     r.notes,
      createdAt:   r.createdAt.toISOString(),
      authorEmail: author?.email ?? (r.updatedBy ?? "—"),
      authorName:  author?.name ?? null,
    };
  });
}

export async function addCustomerNote(
  customerId: string,
  content: string,
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmed = content.trim();
  if (!trimmed) return { success: false, message: "Notitie mag niet leeg zijn." };
  if (trimmed.length > 4000) return { success: false, message: "Maximaal 4000 tekens toegestaan." };

  const [inserted] = await db
    .insert(customerNotesTable)
    .values({ customerId, notes: trimmed, updatedBy: user.id })
    .returning({ id: customerNotesTable.id, createdAt: customerNotesTable.createdAt });

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "create",
    resource:   "customer_notes",
    resourceId: inserted.id,
    metadata:   { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true, data: { id: inserted.id, createdAt: inserted.createdAt.toISOString() } };
}

export async function deleteCustomerNote(
  noteId: string,
  customerId: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(customerNotesTable)
    .where(and(eq(customerNotesTable.id, noteId), eq(customerNotesTable.customerId, customerId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "customer_notes",
    resourceId: noteId,
    metadata:   { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}
