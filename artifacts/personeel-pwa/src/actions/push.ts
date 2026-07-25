"use server";

import {
  db,
  nativePushDeviceTokensTable,
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

export type NativePushTokenPayload = {
  token: string;
  platform: "android" | "ios";
  appId?: string | null;
  appVersion?: string | null;
  appBuild?: string | null;
  deviceId?: string | null;
  deviceModel?: string | null;
  userAgent?: string | null;
};

const PERSONNEL_NATIVE_APP_IDS = new Set([
  "nl.veeleservices.personeel",
  "nl.fieldgrid.personeel",
]);

export type PushSubscriptionResult =
  | { success: true }
  | { success: false; error: string };

export type PushSubscriptionStatusResult =
  | { success: true; active: boolean }
  | { success: false; error: string };

type CurrentPersonnelIdentity = {
  userId: string;
  personnelId: string;
  tenantId: string;
};

async function getCurrentPersonnelIdentity(): Promise<CurrentPersonnelIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({
      id:       personnelTable.id,
      tenantId: personnelTable.tenantId,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  if (!row) return null;

  return {
    userId: user.id,
    personnelId: row.id,
    tenantId: row.tenantId,
  };
}

export async function saveMyPushSubscription(
  payload: BrowserPushSubscriptionPayload,
): Promise<PushSubscriptionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

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
      tenantId: identity.tenantId,
      personnelId: identity.personnelId,
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
        tenantId: identity.tenantId,
        personnelId: identity.personnelId,
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
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

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
        eq(pushSubscriptionsTable.personnelId, identity.personnelId),
        eq(pushSubscriptionsTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  return { success: true, active: subscription?.isActive ?? false };
}

export async function deactivateMyPushSubscription(
  endpoint: string,
): Promise<PushSubscriptionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

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
        eq(pushSubscriptionsTable.personnelId, identity.personnelId),
        eq(pushSubscriptionsTable.tenantId, identity.tenantId),
      ),
    );

  return { success: true };
}

export async function saveMyNativePushToken(
  payload: NativePushTokenPayload,
): Promise<PushSubscriptionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

  const token = payload.token?.trim();
  if (!token || token.length < 32) {
    return { success: false, error: "Native push-token is ongeldig." };
  }
  const appId = payload.appId?.trim() ?? "";
  if (!PERSONNEL_NATIVE_APP_IDS.has(appId)) {
    return { success: false, error: "Native app-identiteit is ongeldig." };
  }
  const normalizedVersion =
    payload.appVersion && payload.appBuild
      ? `${payload.appVersion} (${payload.appBuild})`
      : payload.appVersion ?? payload.appBuild ?? null;

  await db
    .insert(nativePushDeviceTokensTable)
    .values({
      tenantId: identity.tenantId,
      ownerType: "personnel",
      personnelId: identity.personnelId,
      customerId: null,
      userId: identity.userId,
      provider: "fcm",
      platform: payload.platform,
      token,
      appId,
      appVersion: normalizedVersion?.slice(0, 80) ?? null,
      deviceId: payload.deviceId?.slice(0, 160) ?? null,
      deviceModel: payload.deviceModel?.slice(0, 160) ?? null,
      userAgent: payload.userAgent?.slice(0, 1000) ?? null,
      isActive: true,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: nativePushDeviceTokensTable.token,
      set: {
        tenantId: identity.tenantId,
        ownerType: "personnel",
        personnelId: identity.personnelId,
        customerId: null,
        userId: identity.userId,
        platform: payload.platform,
        appId,
        appVersion: normalizedVersion?.slice(0, 80) ?? null,
        deviceId: payload.deviceId?.slice(0, 160) ?? null,
        deviceModel: payload.deviceModel?.slice(0, 160) ?? null,
        userAgent: payload.userAgent?.slice(0, 1000) ?? null,
        isActive: true,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return { success: true };
}

export async function getMyNativePushTokenStatus(
  token: string,
): Promise<PushSubscriptionStatusResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { success: false, error: "Native push-token is ongeldig." };
  }

  const [row] = await db
    .select({ isActive: nativePushDeviceTokensTable.isActive })
    .from(nativePushDeviceTokensTable)
    .where(
      and(
        eq(nativePushDeviceTokensTable.token, normalizedToken),
        eq(nativePushDeviceTokensTable.personnelId, identity.personnelId),
        eq(nativePushDeviceTokensTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  return { success: true, active: row?.isActive ?? false };
}

export async function deactivateMyNativePushToken(
  token: string,
): Promise<PushSubscriptionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd." };

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { success: false, error: "Native push-token is ongeldig." };
  }

  await db
    .update(nativePushDeviceTokensTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(nativePushDeviceTokensTable.token, normalizedToken),
        eq(nativePushDeviceTokensTable.personnelId, identity.personnelId),
        eq(nativePushDeviceTokensTable.tenantId, identity.tenantId),
      ),
    );

  return { success: true };
}
