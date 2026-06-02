"use server";

import { db } from "@workspace/db";
import {
  customersTable,
  customerNotesTable,
  customerTypesTable,
  customerContactsTable,
  objectsTable,
  assignmentsTable,
  invoicesTable,
  sectorsTable,
  auditLogTable,
  insertCustomerSchema,
  updateCustomerSchema,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, inArray, sql, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type SectorOption = { id: string; name: string };

export type CustomerTypeOption = { id: string; name: string; slug: string };

export type CustomerRow = {
  id: string;
  name: string;
  code: string;
  sectorId: string | null;
  sectorName: string | null;
  city: string | null;
  contactEmail: string | null;
  isActive: boolean;
  status: string;
  customerTypeName: string | null;
  customerTypeId: string | null;
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
  legalEntity: string | null;
  vatNumber: string | null;
  chamberOfCommerceNumber: string | null;
  website: string | null;
  mobile: string | null;
  customerTypeId: string | null;
  customerTypeName: string | null;
  status: string;
  accountManagerId: string | null;
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
  legalEntity?: string;
  vatNumber?: string;
  chamberOfCommerceNumber?: string;
  website?: string;
  mobile?: string;
  customerTypeId?: string;
  status?: string;
  accountManagerId?: string;
  notes?: string;
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export type CustomerNoteRow = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  authorEmail: string;
  authorName: string | null;
};

export type CustomerContactRow = {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  function: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  preferredComm: string | null;
  isEmergencyContact: boolean;
  isPrimary: boolean;
};

export type CustomerContactInput = {
  firstName: string;
  lastName: string;
  function?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  preferredComm?: string;
  isEmergencyContact?: boolean;
  isPrimary?: boolean;
};

export type CustomerKpis = {
  monthlyRevenue: string;
  activeObjects: number;
  openAssignments: number;
  openInvoices: number;
  outstandingBalance: string;
  lastActivityDate: string | null;
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
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: CustomerRow[]; total: number }> {
  await requirePermission("customers", "read");

  const {
    search,
    sectorId,
    status = "all",
    customerTypeId,
    city,
    country,
    accountManagerId,
    dateFrom,
    dateTo,
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
  if (customerTypeId) conditions.push(eq(customersTable.customerTypeId, customerTypeId) as ReturnType<typeof eq>);
  if (city?.trim()) conditions.push(ilike(customersTable.city, `%${city.trim()}%`) as ReturnType<typeof eq>);
  if (country?.trim()) conditions.push(ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<typeof eq>);
  if (accountManagerId) conditions.push(eq(customersTable.accountManagerId, accountManagerId) as ReturnType<typeof eq>);
  if (dateFrom) conditions.push(gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<typeof eq>);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }

  // Status filter: backward compat ('active'/'inactive') + new statuses
  if (status === "active") {
    conditions.push(eq(customersTable.status, "active") as ReturnType<typeof eq>);
  } else if (status === "inactive") {
    conditions.push(eq(customersTable.status, "inactive") as ReturnType<typeof eq>);
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

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
        id:               customersTable.id,
        name:             customersTable.name,
        code:             customersTable.code,
        sectorId:         customersTable.sectorId,
        sectorName:       sectorsTable.name,
        city:             customersTable.city,
        contactEmail:     customersTable.contactEmail,
        isActive:         customersTable.isActive,
        status:           customersTable.status,
        customerTypeId:   customersTable.customerTypeId,
        customerTypeName: customerTypesTable.name,
        createdAt:        customersTable.createdAt,
      })
      .from(customersTable)
      .leftJoin(sectorsTable,      eq(customersTable.sectorId,       sectorsTable.id))
      .leftJoin(customerTypesTable, eq(customersTable.customerTypeId, customerTypesTable.id))
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
      id:                      customersTable.id,
      name:                    customersTable.name,
      code:                    customersTable.code,
      sectorId:                customersTable.sectorId,
      sectorName:              sectorsTable.name,
      address:                 customersTable.address,
      city:                    customersTable.city,
      postalCode:              customersTable.postalCode,
      country:                 customersTable.country,
      contactName:             customersTable.contactName,
      contactEmail:            customersTable.contactEmail,
      contactPhone:            customersTable.contactPhone,
      legalEntity:             customersTable.legalEntity,
      vatNumber:               customersTable.vatNumber,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      website:                 customersTable.website,
      mobile:                  customersTable.mobile,
      customerTypeId:          customersTable.customerTypeId,
      customerTypeName:        customerTypesTable.name,
      status:                  customersTable.status,
      accountManagerId:        customersTable.accountManagerId,
      isActive:                customersTable.isActive,
      notes:                   customersTable.notes,
      createdAt:               customersTable.createdAt,
      updatedAt:               customersTable.updatedAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable,      eq(customersTable.sectorId,       sectorsTable.id))
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId, customerTypesTable.id))
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

  await db.delete(customerContactsTable).where(eq(customerContactsTable.customerId, id));
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

// ─── Customer Types ────────────────────────────────────────────────────────────

export async function listCustomerTypes(): Promise<CustomerTypeOption[]> {
  return db
    .select({ id: customerTypesTable.id, name: customerTypesTable.name, slug: customerTypesTable.slug })
    .from(customerTypesTable)
    .where(eq(customerTypesTable.isActive, true))
    .orderBy(asc(customerTypesTable.name));
}

export async function listAllCustomerTypes(): Promise<(CustomerTypeOption & { isActive: boolean; createdAt: string })[]> {
  await requirePermission("settings", "read");
  const rows = await db
    .select({
      id:        customerTypesTable.id,
      name:      customerTypesTable.name,
      slug:      customerTypesTable.slug,
      isActive:  customerTypesTable.isActive,
      createdAt: customerTypesTable.createdAt,
    })
    .from(customerTypesTable)
    .orderBy(asc(customerTypesTable.name));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function createCustomerType(data: {
  name: string;
  slug: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("settings", "write");

  const name = data.name.trim();
  const slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name) return { success: false, message: "Naam is verplicht." };
  if (!slug) return { success: false, message: "Slug is verplicht." };

  try {
    const [created] = await db
      .insert(customerTypesTable)
      .values({ name, slug, isActive: true })
      .returning({ id: customerTypesTable.id });

    revalidatePath("/settings");
    revalidatePath("/instellingen/klanttypes");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een klanttype met deze slug.", fieldErrors: { slug: "Slug al in gebruik" } };
    }
    return { success: false, message: "Klanttype aanmaken mislukt." };
  }
}

export async function updateCustomerType(
  id: string,
  data: { name?: string; slug?: string; isActive?: boolean },
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined)     patch.name     = data.name.trim();
  if (data.slug !== undefined)     patch.slug     = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  try {
    await db.update(customerTypesTable).set(patch).where(eq(customerTypesTable.id, id));
    revalidatePath("/instellingen/klanttypes");
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een klanttype met deze slug." };
    }
    return { success: false, message: "Klanttype bijwerken mislukt." };
  }
}

// ─── Customer Contacts ────────────────────────────────────────────────────────

export async function listCustomerContacts(customerId: string): Promise<CustomerContactRow[]> {
  await requirePermission("customers", "read");

  const rows = await db
    .select()
    .from(customerContactsTable)
    .where(eq(customerContactsTable.customerId, customerId))
    .orderBy(desc(customerContactsTable.isPrimary), asc(customerContactsTable.firstName));

  return rows.map((r) => ({
    id:                 r.id,
    customerId:         r.customerId,
    firstName:          r.firstName,
    lastName:           r.lastName,
    function:           r.function ?? null,
    email:              r.email ?? null,
    phone:              r.phone ?? null,
    mobile:             r.mobile ?? null,
    preferredComm:      r.preferredComm ?? null,
    isEmergencyContact: r.isEmergencyContact,
    isPrimary:          r.isPrimary,
  }));
}

export async function addCustomerContact(
  customerId: string,
  data: CustomerContactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (!data.firstName?.trim()) return { success: false, message: "Voornaam is verplicht.", fieldErrors: { firstName: "Verplicht" } };
  if (!data.lastName?.trim())  return { success: false, message: "Achternaam is verplicht.", fieldErrors: { lastName: "Verplicht" } };

  // If isPrimary, demote existing primary contacts
  if (data.isPrimary) {
    await db
      .update(customerContactsTable)
      .set({ isPrimary: false })
      .where(and(eq(customerContactsTable.customerId, customerId), eq(customerContactsTable.isPrimary, true)));
  }

  const [created] = await db
    .insert(customerContactsTable)
    .values({
      customerId,
      firstName:          data.firstName.trim(),
      lastName:           data.lastName.trim(),
      function:           data.function?.trim()       || null,
      email:              data.email?.trim()           || null,
      phone:              data.phone?.trim()           || null,
      mobile:             data.mobile?.trim()          || null,
      preferredComm:      data.preferredComm           || null,
      isEmergencyContact: data.isEmergencyContact      ?? false,
      isPrimary:          data.isPrimary               ?? false,
    })
    .returning({ id: customerContactsTable.id });

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "create",
    resource:   "customer_contacts",
    resourceId: created!.id,
    metadata:   { customerId, name: `${data.firstName} ${data.lastName}` },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true, data: { id: created!.id } };
}

export async function updateCustomerContact(
  contactId: string,
  customerId: string,
  data: CustomerContactInput,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [existing] = await db
    .select({ id: customerContactsTable.id })
    .from(customerContactsTable)
    .where(and(eq(customerContactsTable.id, contactId), eq(customerContactsTable.customerId, customerId)))
    .limit(1);

  if (!existing) return { success: false, message: "Contact niet gevonden." };

  // If setting as primary, demote others
  if (data.isPrimary) {
    await db
      .update(customerContactsTable)
      .set({ isPrimary: false })
      .where(and(eq(customerContactsTable.customerId, customerId), eq(customerContactsTable.isPrimary, true)));
  }

  await db
    .update(customerContactsTable)
    .set({
      firstName:          data.firstName?.trim(),
      lastName:           data.lastName?.trim(),
      function:           data.function?.trim()       || null,
      email:              data.email?.trim()           || null,
      phone:              data.phone?.trim()           || null,
      mobile:             data.mobile?.trim()          || null,
      preferredComm:      data.preferredComm           || null,
      isEmergencyContact: data.isEmergencyContact      ?? false,
      isPrimary:          data.isPrimary               ?? false,
      updatedAt:          new Date(),
    })
    .where(eq(customerContactsTable.id, contactId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "update",
    resource:   "customer_contacts",
    resourceId: contactId,
    metadata:   { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function deleteCustomerContact(
  contactId: string,
  customerId: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(customerContactsTable)
    .where(and(eq(customerContactsTable.id, contactId), eq(customerContactsTable.customerId, customerId)));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "customer_contacts",
    resourceId: contactId,
    metadata:   { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getCustomerKpis(customerId: string): Promise<CustomerKpis> {
  await requirePermission("customers", "read");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    objectsResult,
    openAssignmentsResult,
    openInvoicesResult,
    monthlyRevenueResult,
    lastActivityResult,
  ] = await Promise.all([
    // Active objects count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectsTable)
      .where(and(eq(objectsTable.customerId, customerId), eq(objectsTable.isActive, true))),

    // Open assignments (not closed/archived)
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.customerId, customerId),
          sql`${assignmentsTable.status} NOT IN ('paid', 'closed', 'cancelled')`,
        ),
      ),

    // Open invoices (status = 'sent')
    db
      .select({
        count:   sql<number>`count(*)::int`,
        balance: sql<string>`coalesce(sum(total_amount), 0)::text`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.customerId, customerId), eq(invoicesTable.status, "sent"))),

    // Monthly revenue (paid invoices this month)
    db
      .select({ revenue: sql<string>`coalesce(sum(total_amount), 0)::text` })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.customerId, customerId),
          eq(invoicesTable.status, "paid"),
          gte(invoicesTable.createdAt, startOfMonth),
        ),
      ),

    // Last activity (most recent assignment scheduled date)
    db
      .select({ scheduledDate: assignmentsTable.scheduledDate })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.customerId, customerId))
      .orderBy(desc(assignmentsTable.scheduledDate))
      .limit(1),
  ]);

  const lastDate = lastActivityResult[0]?.scheduledDate;

  return {
    monthlyRevenue:     monthlyRevenueResult[0]?.revenue      ?? "0",
    activeObjects:      objectsResult[0]?.count               ?? 0,
    openAssignments:    openAssignmentsResult[0]?.count        ?? 0,
    openInvoices:       openInvoicesResult[0]?.count           ?? 0,
    outstandingBalance: openInvoicesResult[0]?.balance         ?? "0",
    lastActivityDate:   lastDate ?? null,
  };
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
    name:                    data.name.trim(),
    sectorId:                data.sectorId                            || null,
    contactName:             data.contactName?.trim()                 || null,
    contactEmail:            data.contactEmail?.trim()                || null,
    contactPhone:            data.contactPhone?.trim()                || null,
    address:                 data.address?.trim()                     || null,
    city:                    data.city?.trim()                        || null,
    postalCode:              data.postalCode?.trim()                  || null,
    country:                 data.country?.trim()                     || "NL",
    legalEntity:             data.legalEntity?.trim()                 || null,
    vatNumber:               data.vatNumber?.trim()                   || null,
    chamberOfCommerceNumber: data.chamberOfCommerceNumber?.trim()     || null,
    website:                 data.website?.trim()                     || null,
    mobile:                  data.mobile?.trim()                      || null,
    customerTypeId:          data.customerTypeId                      || null,
    status:                  data.status                              || "active",
    accountManagerId:        data.accountManagerId                    || null,
    notes:                   data.notes?.trim()                       || null,
    createdBy:               user.id,
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

    // Sync isActive with status
    await db
      .update(customersTable)
      .set({ isActive: payload.status === "active" || payload.status === "lead" || payload.status === "prospect" })
      .where(eq(customersTable.id, created!.id));

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
    name:                    data.name.trim(),
    sectorId:                data.sectorId                            || null,
    contactName:             data.contactName?.trim()                 || null,
    contactEmail:            data.contactEmail?.trim()                || null,
    contactPhone:            data.contactPhone?.trim()                || null,
    address:                 data.address?.trim()                     || null,
    city:                    data.city?.trim()                        || null,
    postalCode:              data.postalCode?.trim()                  || null,
    country:                 data.country?.trim()                     || "NL",
    legalEntity:             data.legalEntity?.trim()                 || null,
    vatNumber:               data.vatNumber?.trim()                   || null,
    chamberOfCommerceNumber: data.chamberOfCommerceNumber?.trim()     || null,
    website:                 data.website?.trim()                     || null,
    mobile:                  data.mobile?.trim()                      || null,
    customerTypeId:          data.customerTypeId                      || null,
    status:                  data.status                              || "active",
    accountManagerId:        data.accountManagerId                    || null,
    notes:                   data.notes?.trim()                       || null,
    isActive:                data.status === "active" || data.status === "lead" || data.status === "prospect",
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
    .set({ isActive, status: isActive ? "active" : "inactive", updatedAt: new Date() })
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

export async function setCustomerLifecycleStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const isActive = status === "active" || status === "lead" || status === "prospect";

  await db
    .update(customersTable)
    .set({ status, isActive, updatedAt: new Date() })
    .where(eq(customersTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "update_status",
    resource:   "customers",
    resourceId: id,
    metadata:   { status },
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
    .set({ isActive, status: isActive ? "active" : "inactive", updatedAt: new Date() })
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
      updatedAt: customerNotesTable.updatedAt,
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
      updatedAt:   r.updatedAt ? r.updatedAt.toISOString() : null,
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

export async function updateCustomerNote(
  noteId: string,
  customerId: string,
  content: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmed = content.trim();
  if (!trimmed) return { success: false, message: "Notitie mag niet leeg zijn." };
  if (trimmed.length > 4000) return { success: false, message: "Maximaal 4000 tekens toegestaan." };

  const [existing] = await db
    .select({ id: customerNotesTable.id })
    .from(customerNotesTable)
    .where(and(
      eq(customerNotesTable.id, noteId),
      eq(customerNotesTable.customerId, customerId),
    ))
    .limit(1);

  if (!existing) return { success: false, message: "Notitie niet gevonden." };

  await db
    .update(customerNotesTable)
    .set({ notes: trimmed, updatedBy: user.id })
    .where(eq(customerNotesTable.id, noteId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "update",
    resource:   "customer_notes",
    resourceId: noteId,
    metadata:   { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
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
    .where(and(
      eq(customerNotesTable.id, noteId),
      eq(customerNotesTable.customerId, customerId),
    ));

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

// ─── Account manager lookup ────────────────────────────────────────────────────

export type AccountManagerOption = {
  id:       string;
  fullName: string;
};

export async function listAccountManagers(): Promise<AccountManagerOption[]> {
  const canRead = await hasPermission("customers", "read");
  if (!canRead) return [];

  const { personnelTable } = await import("@workspace/db");

  const rows = await db
    .select({
      id:        personnelTable.id,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(personnelTable)
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  return rows.map((r) => ({
    id:       r.id,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
  }));
}

// ─── Export ────────────────────────────────────────────────────────────────────

export async function exportCustomers(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<{ csv: string; filename: string }>> {
  await requirePermission("customers", "read");

  const {
    search, sectorId, status = "all", customerTypeId,
    city, country, accountManagerId, dateFrom, dateTo,
  } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(ilike(customersTable.name, term), ilike(customersTable.code, term));
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId)        conditions.push(eq(customersTable.sectorId,       sectorId)       as ReturnType<typeof eq>);
  if (customerTypeId)  conditions.push(eq(customersTable.customerTypeId, customerTypeId) as ReturnType<typeof eq>);
  if (city?.trim())    conditions.push(ilike(customersTable.city,    `%${city.trim()}%`)    as ReturnType<typeof eq>);
  if (country?.trim()) conditions.push(ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<typeof eq>);
  if (accountManagerId) conditions.push(eq(customersTable.accountManagerId, accountManagerId) as ReturnType<typeof eq>);
  if (dateFrom) conditions.push(gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<typeof eq>);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }
  if (status === "active") {
    conditions.push(eq(customersTable.status, "active") as ReturnType<typeof eq>);
  } else if (status === "inactive") {
    conditions.push(eq(customersTable.status, "inactive") as ReturnType<typeof eq>);
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      code:             customersTable.code,
      name:             customersTable.name,
      sectorName:       sectorsTable.name,
      customerTypeName: customerTypesTable.name,
      city:             customersTable.city,
      country:          customersTable.country,
      contactEmail:     customersTable.contactEmail,
      contactPhone:     customersTable.contactPhone,
      status:           customersTable.status,
      createdAt:        customersTable.createdAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable,      eq(customersTable.sectorId,       sectorsTable.id))
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId, customerTypesTable.id))
    .where(where)
    .orderBy(asc(customersTable.name));

  function esc(v: string | null | undefined): string {
    const s = v ?? "";
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const headers = ["Code", "Naam", "Sector", "Type", "Stad", "Land", "E-mail", "Telefoon", "Status", "Aangemaakt op"];
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        esc(r.code),
        esc(r.name),
        esc(r.sectorName),
        esc(r.customerTypeName),
        esc(r.city),
        esc(r.country),
        esc(r.contactEmail),
        esc(r.contactPhone),
        esc(r.status),
        esc(r.createdAt.toISOString().split("T")[0] ?? ""),
      ].join(",")
    ),
  ];

  const now   = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  return {
    success: true,
    data: { csv: csvLines.join("\n"), filename: `klanten_${stamp}.csv` },
  };
}

export async function exportCustomersPdf(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<{ html: string; filename: string }>> {
  await requirePermission("customers", "read");

  const {
    search, sectorId, status = "all", customerTypeId,
    city, country, accountManagerId, dateFrom, dateTo,
  } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(ilike(customersTable.name, term), ilike(customersTable.code, term));
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId)        conditions.push(eq(customersTable.sectorId,       sectorId)       as ReturnType<typeof eq>);
  if (customerTypeId)  conditions.push(eq(customersTable.customerTypeId, customerTypeId) as ReturnType<typeof eq>);
  if (city?.trim())    conditions.push(ilike(customersTable.city,    `%${city.trim()}%`)    as ReturnType<typeof eq>);
  if (country?.trim()) conditions.push(ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<typeof eq>);
  if (accountManagerId) conditions.push(eq(customersTable.accountManagerId, accountManagerId) as ReturnType<typeof eq>);
  if (dateFrom) conditions.push(gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<typeof eq>);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }
  if (status === "active") {
    conditions.push(eq(customersTable.status, "active") as ReturnType<typeof eq>);
  } else if (status === "inactive") {
    conditions.push(eq(customersTable.status, "inactive") as ReturnType<typeof eq>);
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      code:             customersTable.code,
      name:             customersTable.name,
      sectorName:       sectorsTable.name,
      customerTypeName: customerTypesTable.name,
      city:             customersTable.city,
      country:          customersTable.country,
      contactEmail:     customersTable.contactEmail,
      contactPhone:     customersTable.contactPhone,
      status:           customersTable.status,
      createdAt:        customersTable.createdAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable,      eq(customersTable.sectorId,       sectorsTable.id))
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId, customerTypesTable.id))
    .where(where)
    .orderBy(asc(customersTable.name));

  function escHtml(v: string | null | undefined): string {
    return (v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const now        = new Date();
  const stamp      = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const generated  = now.toISOString().replace("T", " ").slice(0, 16);

  const activeFilters: string[] = [];
  if (search)           activeFilters.push(`Zoekopdracht: ${search}`);
  if (status && status !== "all") activeFilters.push(`Status: ${status}`);
  if (city)             activeFilters.push(`Stad: ${city}`);
  if (country)          activeFilters.push(`Land: ${country}`);
  if (dateFrom)         activeFilters.push(`Vanaf: ${dateFrom}`);
  if (dateTo)           activeFilters.push(`Tot: ${dateTo}`);

  const filterLine = activeFilters.length
    ? `<p style="margin:0 0 8px;font-size:11px;color:#64748B;">Filters: ${escHtml(activeFilters.join(" · "))}</p>`
    : "";

  const tbody = rows.map((r) => `
    <tr>
      <td>${escHtml(r.code)}</td>
      <td>${escHtml(r.name)}</td>
      <td>${escHtml(r.sectorName)}</td>
      <td>${escHtml(r.customerTypeName)}</td>
      <td>${escHtml(r.city)}</td>
      <td>${escHtml(r.country)}</td>
      <td>${escHtml(r.contactEmail)}</td>
      <td>${escHtml(r.contactPhone)}</td>
      <td>${escHtml(r.status)}</td>
      <td>${escHtml(r.createdAt.toISOString().split("T")[0] ?? "")}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <title>Klantenlijst — Veele</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #081D3A; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #081D3A; }
    .brand span { color: #00B7B3; }
    .meta { text-align: right; font-size: 10px; color: #64748B; }
    h1 { font-size: 14px; font-weight: 700; margin-bottom: 6px; color: #081D3A; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    thead tr { background: #081D3A; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; font-size: 8px; }
    tbody tr:nth-child(even) { background: #F8FAFC; }
    tbody tr { border-bottom: 1px solid #E2E8F0; }
    tbody td { padding: 5px 8px; vertical-align: top; }
    .count { font-size: 10px; color: #64748B; margin-bottom: 4px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="brand">VEELE<span>.</span></div>
    </div>
    <div class="meta">
      <div>Gegenereerd op: ${generated}</div>
    </div>
  </header>
  <h1>Klantenlijst</h1>
  ${filterLine}
  <p class="count">${rows.length} klant${rows.length !== 1 ? "en" : ""}</p>
  <table>
    <thead>
      <tr>
        <th>Code</th><th>Naam</th><th>Sector</th><th>Type</th>
        <th>Stad</th><th>Land</th><th>E-mail</th><th>Telefoon</th>
        <th>Status</th><th>Aangemaakt op</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>
  <script>window.addEventListener("load",()=>{ window.print(); });<\/script>
</body>
</html>`;

  return {
    success: true,
    data: { html, filename: `klanten_${stamp}.pdf` },
  };
}
