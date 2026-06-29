import { isNativeCapacitorRuntime } from "@/lib/capacitor";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type BrowserPushState =
  | { supported: false; reason: string }
  | {
      supported: true;
      permission: NotificationPermission;
      subscription: PushSubscription | null;
      endpoint: string | null;
    };

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function getReadyServiceWorker() {
  const registration =
    (await navigator.serviceWorker.getRegistration("/personeel/")) ??
    (await navigator.serviceWorker.register("/personeel/sw.js", {
      scope: "/personeel/",
    }));

  if (registration.active) return registration;

  return withTimeout(
    navigator.serviceWorker.ready,
    8000,
    "Service worker is nog niet klaar. Herlaad de app en probeer opnieuw.",
  );
}

export async function getLocalPushState(): Promise<BrowserPushState> {
  if (isNativeCapacitorRuntime()) {
    return {
      supported: false,
      reason:
        "Deze native app gebruikt straks native push via Capacitor/FCM. Browser push is hier niet van toepassing.",
    };
  }

  if (
    typeof window === "undefined" ||
    typeof Notification === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return {
      supported: false,
      reason: "Deze browser ondersteunt web push niet.",
    };
  }

  if (Notification.permission === "denied") {
    return {
      supported: true,
      permission: "denied",
      subscription: null,
      endpoint: null,
    };
  }

  try {
    const registration = await getReadyServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      permission: Notification.permission,
      subscription,
      endpoint: subscription?.endpoint ?? null,
    };
  } catch (error) {
    return {
      supported: false,
      reason:
        error instanceof Error
          ? error.message
          : "Pushstatus kon niet worden opgehaald.",
    };
  }
}

export async function ensureBrowserPushSubscription(): Promise<PushSubscription> {
  if (isNativeCapacitorRuntime()) {
    throw new Error(
      "Deze native app gebruikt straks native push via Capacitor/FCM. Browser push is hier niet van toepassing.",
    );
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Push sleutel ontbreekt in deze build.");
  }

  if (
    typeof Notification === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    throw new Error("Deze browser ondersteunt web push niet.");
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Push is geblokkeerd in de browserinstellingen."
        : "Push toestemming is niet gegeven.",
    );
  }

  const registration = await getReadyServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

export async function unsubscribeBrowserPush(): Promise<string | null> {
  const state = await getLocalPushState();
  if (!state.supported || !state.subscription) return null;

  const endpoint = state.subscription.endpoint;
  await state.subscription.unsubscribe();
  return endpoint;
}
