"use server";

import { revalidatePath } from "next/cache";
import { db, customerPortalPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMyCustomerId } from "./customer";

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
  const customerId = await getMyCustomerId();
  if (!customerId) return DEFAULT_PREFERENCES;

  const [row] = await db
    .select()
    .from(customerPortalPreferencesTable)
    .where(eq(customerPortalPreferencesTable.customerId, customerId))
    .limit(1);

  if (!row) return DEFAULT_PREFERENCES;

  return {
    emailNotifications:  row.emailNotifications,
    invoiceEmails:       row.invoiceEmails,
    quoteEmails:         row.quoteEmails,
    reportEmails:        row.reportEmails,
    serviceUpdateEmails: row.serviceUpdateEmails,
    marketingEmails:     row.marketingEmails,
    pushNotifications:   row.pushNotifications,
  };
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function updateMyPortalPreferences(
  _prev: PreferenceResult,
  formData: FormData,
): Promise<PreferenceResult> {
  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, error: "Geen klantprofiel gevonden." };

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
    .values({ customerId, ...values })
    .onConflictDoUpdate({
      target: customerPortalPreferencesTable.customerId,
      set:    { ...values, updatedAt: new Date() },
    });

  revalidatePath("/instellingen");
  revalidatePath("/meldingen");

  return { success: true };
}
