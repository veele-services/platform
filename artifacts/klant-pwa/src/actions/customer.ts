"use server";

import { getCurrentPortalTenantId } from "@/lib/auth/tenant";
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

export type CustomerIdentity = {
  customerId: string;
  customerUserId: string;
  tenantId: string;
  customerName: string;
  contactName: string | null;
  email: string;
  userId: string;
};

export type CustomerScope = CustomerIdentity;

export async function getMyCustomerIdentity(): Promise<CustomerIdentity | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const tenantId = await getCurrentPortalTenantId();
  if (!tenantId) return null;

  const email = user.email.toLowerCase();

  const [linked] = await db
    .select({
      id: customerUsersTable.id,
      customerId: customerUsersTable.customerId,
      userId: customerUsersTable.userId,
      tenantId: customerUsersTable.tenantId,
      firstName: customerUsersTable.firstName,
      lastName: customerUsersTable.lastName,
      customerName: customersTable.name,
      contactName: customersTable.contactName,
    })
    .from(customerUsersTable)
    .innerJoin(customersTable, eq(customersTable.id, customerUsersTable.customerId))
    .where(
      and(
        eq(customerUsersTable.tenantId, tenantId),
        eq(customerUsersTable.status, "active"),
        eq(customersTable.tenantId, tenantId),
        eq(customersTable.tenantId, customerUsersTable.tenantId),
        or(
          eq(customerUsersTable.userId, user.id),
          and(
            isNull(customerUsersTable.userId),
            eq(customerUsersTable.email, email),
          ),
        ),
      ),
    )
    .limit(1);

  if (linked) {
    if (!linked.userId) {
      await db
        .update(customerUsersTable)
        .set({ userId: user.id, lastLoginAt: new Date() })
        .where(
          and(
            eq(customerUsersTable.id, linked.id),
            eq(customerUsersTable.tenantId, tenantId),
            isNull(customerUsersTable.userId),
          ),
        );
    } else {
      await db
        .update(customerUsersTable)
        .set({ lastLoginAt: new Date() })
        .where(and(eq(customerUsersTable.id, linked.id), eq(customerUsersTable.tenantId, tenantId)));
    }

    const linkedName = [linked.firstName, linked.lastName].filter(Boolean).join(" ").trim();
    return {
      customerId: linked.customerId,
      customerUserId: linked.id,
      tenantId: linked.tenantId,
      customerName: linked.customerName,
      contactName: linkedName || linked.contactName,
      email,
      userId: user.id,
    };
  }

  return null;
}

/**
 * Look up the customer record for the currently logged-in user.
 * Authorization always starts from customer_users and is scoped to tenant_id + customer_id.
 */
export async function getMyCustomerProfile(): Promise<CustomerProfile | null> {
  const identity = await getMyCustomerIdentity();
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
    .where(
      and(
        eq(customersTable.id, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Get the customer ID for the logged-in user. Returns null if not found.
 */
export async function getMyCustomerId(): Promise<string | null> {
  const identity = await getMyCustomerIdentity();
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

  const identity = await getMyCustomerIdentity();
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
    .where(
      and(
        eq(customersTable.id, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .returning({ id: customersTable.id });

  if (updated.length === 0) {
    return { success: false, error: "Klantprofiel niet gevonden." };
  }

  return { success: true };
}
