"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { customerUsersTable, customersTable, customerTypesTable } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod/v4";

export type CustomerProfile = {
  id:                      string;
  name:                    string;
  code:                    string;
  address:                 string | null;
  city:                    string | null;
  contactName:             string | null;
  contactEmail:            string | null;
  contactPhone:            string | null;
  mobile:                  string | null;
  customerTypeName:        string | null;
  legalEntity:             string | null;
  vatNumber:               string | null;
  chamberOfCommerceNumber: string | null;
  website:                 string | null;
};

export type UpdateContactResult = { success: true } | { success: false; error: string };

async function resolveCustomerIdentity(): Promise<{
  customerId: string;
  email: string;
  userId: string;
} | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

  const [linked] = await db
    .select({
      id: customerUsersTable.id,
      customerId: customerUsersTable.customerId,
      userId: customerUsersTable.userId,
    })
    .from(customerUsersTable)
    .where(
      and(
        eq(customerUsersTable.status, "active"),
        or(
          eq(customerUsersTable.userId, user.id),
          eq(customerUsersTable.email, email),
        ),
      ),
    )
    .limit(1);

  if (linked) {
    if (!linked.userId) {
      await db
        .update(customerUsersTable)
        .set({ userId: user.id, lastLoginAt: new Date() })
        .where(and(eq(customerUsersTable.id, linked.id), isNull(customerUsersTable.userId)));
    } else {
      await db
        .update(customerUsersTable)
        .set({ lastLoginAt: new Date() })
        .where(eq(customerUsersTable.id, linked.id));
    }

    return { customerId: linked.customerId, email, userId: user.id };
  }

  const [legacyCustomer] = await db
    .select({
      id: customersTable.id,
      tenantId: customersTable.tenantId,
      contactName: customersTable.contactName,
    })
    .from(customersTable)
    .where(eq(customersTable.contactEmail, email))
    .limit(1);

  if (!legacyCustomer) return null;

  await db
    .insert(customerUsersTable)
    .values({
      tenantId: legacyCustomer.tenantId,
      customerId: legacyCustomer.id,
      userId: user.id,
      email,
      firstName: legacyCustomer.contactName ?? null,
      role: "primary",
      status: "active",
      lastLoginAt: new Date(),
    })
    .onConflictDoNothing();

  return { customerId: legacyCustomer.id, email, userId: user.id };
}

/**
 * Look up the customer record for the currently logged-in user.
 * Prefers customer_users, with a legacy contact_email fallback for existing accounts.
 */
export async function getMyCustomerProfile(): Promise<CustomerProfile | null> {
  const identity = await resolveCustomerIdentity();
  if (!identity) return null;

  const [row] = await db
    .select({
      id:                      customersTable.id,
      name:                    customersTable.name,
      code:                    customersTable.code,
      address:                 customersTable.address,
      city:                    customersTable.city,
      contactName:             customersTable.contactName,
      contactEmail:            customersTable.contactEmail,
      contactPhone:            customersTable.contactPhone,
      mobile:                  customersTable.mobile,
      customerTypeName:        customerTypesTable.name,
      legalEntity:             customersTable.legalEntity,
      vatNumber:               customersTable.vatNumber,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      website:                 customersTable.website,
    })
    .from(customersTable)
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId, customerTypesTable.id))
    .where(eq(customersTable.id, identity.customerId))
    .limit(1);

  return row ?? null;
}

/**
 * Get the customer ID for the logged-in user. Returns null if not found.
 */
export async function getMyCustomerId(): Promise<string | null> {
  const identity = await resolveCustomerIdentity();
  return identity?.customerId ?? null;
}

const updateContactSchema = z.object({
  contactName:  z.string().trim().min(1, "Naam is verplicht").max(200),
  contactPhone: z.string().trim().max(50).nullable().optional(),
  mobile:       z.string().trim().max(50).nullable().optional(),
});

/**
 * Allow a customer to update their own contactName, contactPhone and mobile.
 * Sensitive fields (VAT, KVK, legal entity) are intentionally excluded.
 */
export async function updateMyContactInfo(
  _prev: UpdateContactResult,
  formData: FormData,
): Promise<UpdateContactResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { success: false, error: "Niet ingelogd." };

  const identity = await resolveCustomerIdentity();
  if (!identity) return { success: false, error: "Klantprofiel niet gevonden." };

  const parsed = updateContactSchema.safeParse({
    contactName:  formData.get("contactName"),
    contactPhone: formData.get("contactPhone") || null,
    mobile:       formData.get("mobile") || null,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? "Ongeldige invoer." };
  }

  const updated = await db
    .update(customersTable)
    .set({
      contactName:  parsed.data.contactName,
      contactPhone: parsed.data.contactPhone ?? null,
      mobile:       parsed.data.mobile ?? null,
    })
    .where(eq(customersTable.id, identity.customerId))
    .returning({ id: customersTable.id });

  if (updated.length === 0) {
    return { success: false, error: "Klantprofiel niet gevonden." };
  }

  return { success: true };
}
