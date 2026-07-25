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

const cachedAccessTokens = new Map<
  string,
  { token: string; expiresAt: number }
>();

function appConfigPrefix(appId: string | null | undefined): string | null {
  if (appId === "nl.veeleservices.personeel") return "VEELE";
  if (appId === "nl.fieldgrid.personeel") return "FIELDGRID";
  return null;
}

function envName(prefix: string | null, suffix: string): string {
  return prefix ? `FCM_${prefix}_${suffix}` : `FCM_${suffix}`;
}

function readServiceAccountFromEnv(
  prefix: string | null,
): Partial<FcmConfig> | null {
  const encoded = process.env[envName(prefix, "SERVICE_ACCOUNT_JSON_BASE64")];
  const rawJson = process.env[envName(prefix, "SERVICE_ACCOUNT_JSON")];

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

function readFcmConfig(prefix: string | null): FcmConfig | null {
  if (process.env[envName(prefix, "ENABLED")]?.toLowerCase() === "false") {
    return null;
  }

  const serviceAccount = readServiceAccountFromEnv(prefix);
  const projectId =
    serviceAccount?.projectId ??
    process.env[envName(prefix, "PROJECT_ID")] ??
    (!prefix ? process.env["FIREBASE_PROJECT_ID"] : undefined) ??
    "";
  const clientEmail =
    serviceAccount?.clientEmail ??
    process.env[envName(prefix, "CLIENT_EMAIL")] ??
    (!prefix ? process.env["FIREBASE_CLIENT_EMAIL"] : undefined) ??
    "";
  const privateKey =
    serviceAccount?.privateKey ??
    process.env[envName(prefix, "PRIVATE_KEY")] ??
    (!prefix ? process.env["FIREBASE_PRIVATE_KEY"] : undefined) ??
    "";

  if (!projectId || !clientEmail || !privateKey) return null;

  const defaultChannel =
    prefix === "FIELDGRID" ? "fieldgrid_operations" : "veele_operations";

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    androidChannelId:
      process.env[envName(prefix, "ANDROID_CHANNEL_ID")] || defaultChannel,
  };
}

function getFcmConfig(appId?: string | null): FcmConfig | null {
  if (process.env["FCM_ENABLED"]?.toLowerCase() === "false") return null;
  const prefix = appConfigPrefix(appId);
  return (prefix ? readFcmConfig(prefix) : null) ?? readFcmConfig(null);
}

export function isFcmConfigured(appId?: string | null): boolean {
  if (process.env["FCM_ENABLED"]?.toLowerCase() === "false") return false;
  if (typeof appId === "undefined") {
    return Boolean(
      readFcmConfig("VEELE") ??
      readFcmConfig("FIELDGRID") ??
      readFcmConfig(null),
    );
  }
  return getFcmConfig(appId) !== null;
}

async function createAccessToken(config: FcmConfig): Promise<string> {
  const now = Date.now();
  const cacheKey = `${config.projectId}:${config.clientEmail}`;
  const cachedAccessToken = cachedAccessTokens.get(cacheKey);
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

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description ||
        body.error ||
        `OAuth token request failed with HTTP ${response.status}`,
    );
  }

  const nextAccessToken = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  cachedAccessTokens.set(cacheKey, nextAccessToken);

  return nextAccessToken.token;
}

function stringifyDataValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
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
    priority: stringifyDataValue(
      payload.priority ?? payload.urgency ?? "normal",
    ),
  };
}

function isHighPriority(urgency: WebPushUrgency | unknown): boolean {
  return urgency === "high";
}

function fcmErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: string; status?: string } })
    .error;
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
  appId?: string | null,
): Promise<FcmPushSendResult> {
  const config = getFcmConfig(appId);
  if (!config) {
    return {
      success: false,
      status: 0,
      error: `FCM is niet geconfigureerd voor app ${appId || "onbekend"}. Stel app-specifieke of algemene FCM-credentials in.`,
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
      notificationPriority: isHighPriority(urgency)
        ? "PRIORITY_HIGH"
        : "PRIORITY_DEFAULT",
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

    const body = (await response.json().catch(() => ({}))) as { name?: string };

    if (response.ok) {
      return {
        success: true,
        status: response.status,
        messageId: body.name ?? null,
      };
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
