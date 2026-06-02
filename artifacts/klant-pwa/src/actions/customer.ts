"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { customersTable, customerTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

/**
 * Look up the customer record for the currently logged-in user.
 * Matches on contact_email = auth user email.
 */
export async function getMyCustomerProfile(): Promise<CustomerProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

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
    .where(eq(customersTable.contactEmail, email))
    .limit(1);

  return row ?? null;
}

/**
 * Get the customer ID for the logged-in user. Returns null if not found.
 */
export async function getMyCustomerId(): Promise<string | null> {
  const profile = await getMyCustomerProfile();
  return profile?.id ?? null;
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

  const email = user.email.toLowerCase();

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
    .where(eq(customersTable.contactEmail, email))
    .returning({ id: customersTable.id });

  if (updated.length === 0) {
    return { success: false, error: "Klantprofiel niet gevonden." };
  }

  return { success: true };
}
