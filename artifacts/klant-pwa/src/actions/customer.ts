"use server";

import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { customerUsersTable, customersTable, customerTypesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

const CUSTOMER_CONTEXT_COOKIE = "fieldgrid_customer_context";

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

export type CustomerContextOption = {
  customerUserId: string;
  customerId: string;
  customerName: string;
  role: string;
};

type CustomerMembership = CustomerIdentity & {
  role: string;
};

async function loadMyCustomerMemberships(): Promise<CustomerMembership[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const tenantId = await requireCurrentCustomerPortalTenantId();
  if (!tenantId) return [];

  const links = await db
    .select({
      id: customerUsersTable.id,
      customerId: customerUsersTable.customerId,
      userId: customerUsersTable.userId,
      tenantId: customerUsersTable.tenantId,
      email: customerUsersTable.email,
      firstName: customerUsersTable.firstName,
      lastName: customerUsersTable.lastName,
      role: customerUsersTable.role,
      customerName: customersTable.name,
      contactName: customersTable.contactName,
    })
    .from(customerUsersTable)
    .innerJoin(customersTable, eq(customersTable.id, customerUsersTable.customerId))
    .where(
      and(
        eq(customerUsersTable.tenantId, tenantId),
        eq(customerUsersTable.status, "active"),
        eq(customerUsersTable.userId, user.id),
        eq(customersTable.tenantId, tenantId),
        eq(customersTable.tenantId, customerUsersTable.tenantId),
        eq(customersTable.isActive, true),
      ),
    )
    .orderBy(asc(customersTable.name), asc(customerUsersTable.id));

  return links.map((linked) => {
    const linkedName = [linked.firstName, linked.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      customerId: linked.customerId,
      customerUserId: linked.id,
      tenantId: linked.tenantId,
      customerName: linked.customerName,
      contactName: linkedName || linked.contactName,
      email: linked.email,
      userId: user.id,
      role: linked.role,
    };
  });
}

export async function getMyCustomerContextState(): Promise<{
  options: CustomerContextOption[];
  selectedCustomerUserId: string | null;
  selectionRequired: boolean;
}> {
  const memberships = await loadMyCustomerMemberships();
  const selectedCookie =
    (await cookies()).get(CUSTOMER_CONTEXT_COOKIE)?.value ?? null;
  const selected = memberships.find(
    (membership) => membership.customerUserId === selectedCookie,
  );
  return {
    options: memberships.map((membership) => ({
      customerUserId: membership.customerUserId,
      customerId: membership.customerId,
      customerName: membership.customerName,
      role: membership.role,
    })),
    selectedCustomerUserId: selected?.customerUserId ?? null,
    selectionRequired: memberships.length > 1 && !selected,
  };
}

export async function selectMyCustomerContext(formData: FormData): Promise<void> {
  const parsed = z.string().uuid().safeParse(formData.get("customerUserId"));
  if (!parsed.success) redirect("/klant/context-kiezen?fout=ongeldig");

  const memberships = await loadMyCustomerMemberships();
  const selected = memberships.find(
    (membership) => membership.customerUserId === parsed.data,
  );
  if (!selected) redirect("/klant/context-kiezen?fout=niet-toegestaan");

  (await cookies()).set(CUSTOMER_CONTEXT_COOKIE, selected.customerUserId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/klant",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/klant");
}

export async function getMyCustomerIdentity(): Promise<CustomerIdentity | null> {
  const memberships = await loadMyCustomerMemberships();
  if (memberships.length === 0) return null;

  const selectedCookie =
    (await cookies()).get(CUSTOMER_CONTEXT_COOKIE)?.value ?? null;
  const linked =
    memberships.find(
      (membership) => membership.customerUserId === selectedCookie,
    ) ?? (memberships.length === 1 ? memberships[0] : null);
  if (!linked) return null;

  await db
    .update(customerUsersTable)
    .set({ lastLoginAt: new Date() })
    .where(
      and(
        eq(customerUsersTable.id, linked.customerUserId),
        eq(customerUsersTable.tenantId, linked.tenantId),
        eq(customerUsersTable.userId, linked.userId),
      ),
    );

  return linked;
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
