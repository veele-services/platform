"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type CustomerProfile = {
  id:           string;
  name:         string;
  code:         string;
  address:      string | null;
  city:         string | null;
  contactName:  string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/**
 * Look up the customer record for the currently logged-in user.
 * Matches on contact_email = auth user email.
 */
export async function getMyCustomerProfile(): Promise<CustomerProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

  const [customer] = await db
    .select({
      id:           customersTable.id,
      name:         customersTable.name,
      code:         customersTable.code,
      address:      customersTable.address,
      city:         customersTable.city,
      contactName:  customersTable.contactName,
      contactEmail: customersTable.contactEmail,
      contactPhone: customersTable.contactPhone,
    })
    .from(customersTable)
    .where(eq(customersTable.contactEmail, email))
    .limit(1);

  return customer ?? null;
}

/**
 * Get the customer ID for the logged-in user. Returns null if not found.
 */
export async function getMyCustomerId(): Promise<string | null> {
  const profile = await getMyCustomerProfile();
  return profile?.id ?? null;
}
