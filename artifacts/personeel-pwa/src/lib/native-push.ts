"use client";

import { getCapacitorPlatform, isNativeCapacitorRuntime } from "@/lib/capacitor";

const STORAGE_KEY = "veele-native-fcm-token";

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type PushNotificationsBridge = {
  checkPermissions: () => Promise<{ receive: PermissionState }>;
  requestPermissions: () => Promise<{ receive: PermissionState }>;
  register: () => Promise<void>;
  unregister?: () => Promise<void>;
  createChannel?: (channel: {
    id: string;
    name: string;
    description?: string;
    importance?: number;
    visibility?: number;
    vibration?: boolean;
    sound?: string;
  }) => Promise<void>;
  addListener: (
    eventName: "registration" | "registrationError",
    listenerFunc: (payload: { value?: string; error?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

export type NativePushState =
  | { supported: false; reason: string }
  | {
      supported: true;
      permission: PermissionState;
      token: string | null;
      platform: "android" | "ios";
    };

export type NativePushRegistration = {
  token: string;
  platform: "android" | "ios";
};

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function normalizePlatform(value: string): "android" | "ios" {
  return value === "ios" ? "ios" : "android";
}

async function getBridge(): Promise<PushNotificationsBridge | null> {
  if (!isNativeCapacitorRuntime()) return null;

  const module = await import("@capacitor/push-notifications");
  return module.PushNotifications as PushNotificationsBridge;
}

export async function getLocalNativePushState(): Promise<NativePushState> {
  const bridge = await getBridge();
  if (!bridge) {
    return {
      supported: false,
      reason: "Native push is alleen beschikbaar in de Capacitor app.",
    };
  }

  const permission = await bridge.checkPermissions();

  return {
    supported: true,
    permission: permission.receive,
    token: getStoredToken(),
    platform: normalizePlatform(getCapacitorPlatform()),
  };
}

export async function ensureNativePushRegistration(): Promise<NativePushRegistration> {
  const bridge = await getBridge();
  if (!bridge) {
    throw new Error("Native push is alleen beschikbaar in de Capacitor app.");
  }

  const currentPermission = await bridge.checkPermissions();
  const permission =
    currentPermission.receive === "prompt" ||
    currentPermission.receive === "prompt-with-rationale"
      ? await bridge.requestPermissions()
      : currentPermission;

  if (permission.receive !== "granted") {
    throw new Error(
      permission.receive === "denied"
        ? "App push is geblokkeerd in de apparaatinstellingen."
        : "App push toestemming is niet gegeven.",
    );
  }

  if (normalizePlatform(getCapacitorPlatform()) === "android") {
    await bridge.createChannel?.({
      id: "veele_operations",
      name: "Veele meldingen",
      description: "Planning, werkbonnen en urgente operationele meldingen.",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "default",
    }).catch(() => undefined);
  }

  const token = await new Promise<string>(async (resolve, reject) => {
    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let errorHandle: { remove: () => Promise<void> } | null = null;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Native push registratie duurde te lang."));
    }, 12000);

    async function cleanup() {
      window.clearTimeout(timeout);
      await registrationHandle?.remove().catch(() => undefined);
      await errorHandle?.remove().catch(() => undefined);
    }

    registrationHandle = await bridge.addListener("registration", async (registration) => {
      await cleanup();
      if (!registration.value) {
        reject(new Error("Firebase gaf geen device token terug."));
        return;
      }
      resolve(registration.value);
    });

    errorHandle = await bridge.addListener("registrationError", async (error) => {
      await cleanup();
      reject(new Error(error.error || "Native push registratie mislukt."));
    });

    await bridge.register();
  });

  setStoredToken(token);

  return {
    token,
    platform: normalizePlatform(getCapacitorPlatform()),
  };
}

export async function unregisterNativePush(): Promise<string | null> {
  const previousToken = getStoredToken();
  const bridge = await getBridge();
  await bridge?.unregister?.().catch(() => undefined);
  setStoredToken(null);
  return previousToken;
}
