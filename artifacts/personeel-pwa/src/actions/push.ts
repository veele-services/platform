"use server";

import {
  db,
  personnelTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

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

export type PushSubscriptionStatusResult =
  | { success: true; active: boolean }
  | { success: false; error: string };

async function getCurrentPersonnelId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row?.id ?? null;
}

export async function saveMyPushSubscription(
  payload: BrowserPushSubscriptionPayload,
): Promise<PushSubscriptionResult> {
  const personnelId = await getCurrentPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd." };

  const endpoint = payload.endpoint?.trim();
  const p256dh = payload.keys.p256dh?.trim();
  const auth = payload.keys.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return { success: false, error: "Push-abonnement is ongeldig." };
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({
      ownerType: "personnel",
      personnelId,
      customerId: null,
      endpoint,
      p256dh,
      auth,
      userAgent: payload.userAgent?.slice(0, 1000) ?? null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        ownerType: "personnel",
        personnelId,
        customerId: null,
        p256dh,
        auth,
        userAgent: payload.userAgent?.slice(0, 1000) ?? null,
        isActive: true,
        updatedAt: new Date(),
      },
    });

  return { success: true };
}

export async function getMyPushSubscriptionStatus(
  endpoint: string,
): Promise<PushSubscriptionStatusResult> {
  const personnelId = await getCurrentPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd." };

  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    return { success: false, error: "Push-abonnement is ongeldig." };
  }

  const [subscription] = await db
    .select({ isActive: pushSubscriptionsTable.isActive })
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, normalizedEndpoint),
        eq(pushSubscriptionsTable.personnelId, personnelId),
      ),
    )
    .limit(1);

  return { success: true, active: subscription?.isActive ?? false };
}

export async function deactivateMyPushSubscription(
  endpoint: string,
): Promise<PushSubscriptionResult> {
  const personnelId = await getCurrentPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd." };

  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    return { success: false, error: "Push-abonnement is ongeldig." };
  }

  await db
    .update(pushSubscriptionsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, normalizedEndpoint),
        eq(pushSubscriptionsTable.personnelId, personnelId),
      ),
    );

  return { success: true };
}
