import { Buffer } from "node:buffer";
import { importPKCS8, SignJWT } from "jose";
import type { WebPushPayload, WebPushUrgency } from "./web-push";

type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  androidChannelId: string | null;
};

export type FcmPushSendResult =
  | { success: true; status: number; messageId: string | null }
  | {
      success: false;
      status: number;
      error: string;
      permanent: boolean;
      configurationMissing?: boolean;
    };

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function readServiceAccountFromEnv(): Partial<FcmConfig> | null {
  const encoded = process.env["FCM_SERVICE_ACCOUNT_JSON_BASE64"];
  const rawJson = process.env["FCM_SERVICE_ACCOUNT_JSON"];

  const source = encoded
    ? Buffer.from(encoded, "base64").toString("utf8")
    : rawJson;

  if (!source) return null;

  try {
    const parsed = JSON.parse(source) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch {
    return null;
  }
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function getFcmConfig(): FcmConfig | null {
  if (process.env["FCM_ENABLED"]?.toLowerCase() === "false") return null;

  const serviceAccount = readServiceAccountFromEnv();
  const projectId =
    serviceAccount?.projectId ??
    process.env["FCM_PROJECT_ID"] ??
    process.env["FIREBASE_PROJECT_ID"] ??
    "";
  const clientEmail =
    serviceAccount?.clientEmail ??
    process.env["FCM_CLIENT_EMAIL"] ??
    process.env["FIREBASE_CLIENT_EMAIL"] ??
    "";
  const privateKey =
    serviceAccount?.privateKey ??
    process.env["FCM_PRIVATE_KEY"] ??
    process.env["FIREBASE_PRIVATE_KEY"] ??
    "";

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    androidChannelId: process.env["FCM_ANDROID_CHANNEL_ID"] || null,
  };
}

export function isFcmConfigured(): boolean {
  return getFcmConfig() !== null;
}

async function createAccessToken(config: FcmConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const key = await importPKCS8(config.privateKey, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.clientEmail)
    .setSubject(config.clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description || body.error || `OAuth token request failed with HTTP ${response.status}`,
    );
  }

  cachedAccessToken = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };

  return cachedAccessToken.token;
}

function stringifyDataValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function buildData(payload: WebPushPayload): Record<string, string> {
  const data: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key === "title" || key === "body") continue;
    data[key] = stringifyDataValue(value);
  }

  return {
    ...data,
    href: stringifyDataValue(payload.href ?? "/personeel/meldingen"),
    priority: stringifyDataValue(payload.priority ?? payload.urgency ?? "normal"),
  };
}

function isHighPriority(urgency: WebPushUrgency | unknown): boolean {
  return urgency === "high";
}

function fcmErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: string; status?: string } }).error;
  return error?.message || error?.status || fallback;
}

function isPermanentFcmError(status: number, body: unknown): boolean {
  if (status === 404) return true;
  if (!body || typeof body !== "object") return false;

  const errorStatus = (body as { error?: { status?: string } }).error?.status;
  return errorStatus === "UNREGISTERED" || errorStatus === "NOT_FOUND";
}

export async function sendFcmPush(
  token: string,
  payload: WebPushPayload,
  urgency: WebPushUrgency = "normal",
): Promise<FcmPushSendResult> {
  const config = getFcmConfig();
  if (!config) {
    return {
      success: false,
      status: 0,
      error:
        "FCM is niet geconfigureerd. Stel FCM_SERVICE_ACCOUNT_JSON_BASE64 of FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY in.",
      permanent: false,
      configurationMissing: true,
    };
  }

  try {
    const accessToken = await createAccessToken(config);
    const priority = isHighPriority(urgency) ? "HIGH" : "NORMAL";
    const androidNotification: Record<string, unknown> = {
      sound: "default",
      defaultVibrateTimings: true,
      notificationPriority: isHighPriority(urgency) ? "PRIORITY_HIGH" : "PRIORITY_DEFAULT",
    };

    if (config.androidChannelId) {
      androidNotification["channelId"] = config.androidChannelId;
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body ?? "",
            },
            data: buildData(payload),
            android: {
              priority,
              notification: androidNotification,
            },
          },
        }),
      },
    );

    const body = await response.json().catch(() => ({})) as { name?: string };

    if (response.ok) {
      return { success: true, status: response.status, messageId: body.name ?? null };
    }

    return {
      success: false,
      status: response.status,
      error: fcmErrorMessage(body, `FCM returned HTTP ${response.status}`),
      permanent: isPermanentFcmError(response.status, body),
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error instanceof Error ? error.message : "Unknown FCM error",
      permanent: false,
    };
  }
}
