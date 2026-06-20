"use server";

import {
  db,
  pushSubscriptionsTable,
} from "@workspace/db";
import { getMyCustomerId } from "./customer";

export type BrowserPushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh?: string | null;
    auth?: string | null;
  };
  userAgent?: string | null;
};

export type PushSubscriptionResult =
  | { success: true }
  | { success: false; error: string };

export async function saveMyCustomerPushSubscription(
  payload: BrowserPushSubscriptionPayload,
): Promise<PushSubscriptionResult> {
  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, error: "Niet ingelogd." };

  const endpoint = payload.endpoint?.trim();
  const p256dh = payload.keys.p256dh?.trim();
  const auth = payload.keys.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return { success: false, error: "Push-abonnement is ongeldig." };
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({
      ownerType: "customer",
      personnelId: null,
      customerId,
      endpoint,
      p256dh,
      auth,
      userAgent: payload.userAgent?.slice(0, 1000) ?? null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        ownerType: "customer",
        personnelId: null,
        customerId,
        p256dh,
        auth,
        userAgent: payload.userAgent?.slice(0, 1000) ?? null,
        isActive: true,
        updatedAt: new Date(),
      },
    });

  return { success: true };
}
