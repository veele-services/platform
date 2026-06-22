"use server";

import { revalidatePath } from "next/cache";
import { db, customerPortalPreferencesTable, customersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getMyCustomerIdentity } from "./customer";

export type CustomerPortalPreferenceState = {
  emailNotifications:  boolean;
  invoiceEmails:       boolean;
  quoteEmails:         boolean;
  reportEmails:        boolean;
  serviceUpdateEmails: boolean;
  marketingEmails:     boolean;
  pushNotifications:   boolean;
};

export type PreferenceResult = { success: true } | { success: false; error: string };

const DEFAULT_PREFERENCES: CustomerPortalPreferenceState = {
  emailNotifications:  true,
  invoiceEmails:       true,
  quoteEmails:         true,
  reportEmails:        true,
  serviceUpdateEmails: true,
  marketingEmails:     false,
  pushNotifications:   false,
};

export async function getMyPortalPreferences(): Promise<CustomerPortalPreferenceState> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return DEFAULT_PREFERENCES;

  const [row] = await db
    .select()
    .from(customerPortalPreferencesTable)
    .innerJoin(customersTable, eq(customersTable.id, customerPortalPreferencesTable.customerId))
    .where(
      and(
        eq(customerPortalPreferencesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  if (!row?.customer_portal_preferences) return DEFAULT_PREFERENCES;
  const preferences = row.customer_portal_preferences;

  return {
    emailNotifications:  preferences.emailNotifications,
    invoiceEmails:       preferences.invoiceEmails,
    quoteEmails:         preferences.quoteEmails,
    reportEmails:        preferences.reportEmails,
    serviceUpdateEmails: preferences.serviceUpdateEmails,
    marketingEmails:     preferences.marketingEmails,
    pushNotifications:   preferences.pushNotifications,
  };
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function updateMyPortalPreferences(
  _prev: PreferenceResult,
  formData: FormData,
): Promise<PreferenceResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Geen klantprofiel gevonden." };

  const values: CustomerPortalPreferenceState = {
    emailNotifications:  checked(formData, "emailNotifications"),
    invoiceEmails:       checked(formData, "invoiceEmails"),
    quoteEmails:         checked(formData, "quoteEmails"),
    reportEmails:        checked(formData, "reportEmails"),
    serviceUpdateEmails: checked(formData, "serviceUpdateEmails"),
    marketingEmails:     checked(formData, "marketingEmails"),
    pushNotifications:   checked(formData, "pushNotifications"),
  };

  await db
    .insert(customerPortalPreferencesTable)
    .values({ customerId: identity.customerId, ...values })
    .onConflictDoUpdate({
      target: customerPortalPreferencesTable.customerId,
      set:    { ...values, updatedAt: new Date() },
    });

  revalidatePath("/instellingen");
  revalidatePath("/meldingen");

  return { success: true };
}
