import { Buffer } from "node:buffer";
import { importPKCS8, SignJWT } from "jose";
import type { WebPushPayload, WebPushUrgency } from "./web-push";

export type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  androidChannelId: string | null;
};

export type FcmEnvironment = Readonly<Record<string, string | undefined>>;

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
  environment: FcmEnvironment,
): Partial<FcmConfig> | null {
  const encoded = environment[envName(prefix, "SERVICE_ACCOUNT_JSON_BASE64")];
  const rawJson = environment[envName(prefix, "SERVICE_ACCOUNT_JSON")];

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

function defaultAndroidChannel(prefix: string | null): string {
  return prefix === "FIELDGRID" ? "fieldgrid_operations" : "veele_operations";
}

function readFcmConfig(
  prefix: string | null,
  environment: FcmEnvironment,
  androidChannelId?: string,
): FcmConfig | null {
  if (environment[envName(prefix, "ENABLED")]?.toLowerCase() === "false") {
    return null;
  }

  const serviceAccount = readServiceAccountFromEnv(prefix, environment);
  const projectId =
    serviceAccount?.projectId ??
    environment[envName(prefix, "PROJECT_ID")] ??
    (!prefix ? environment["FIREBASE_PROJECT_ID"] : undefined) ??
    "";
  const clientEmail =
    serviceAccount?.clientEmail ??
    environment[envName(prefix, "CLIENT_EMAIL")] ??
    (!prefix ? environment["FIREBASE_CLIENT_EMAIL"] : undefined) ??
    "";
  const privateKey =
    serviceAccount?.privateKey ??
    environment[envName(prefix, "PRIVATE_KEY")] ??
    (!prefix ? environment["FIREBASE_PRIVATE_KEY"] : undefined) ??
    "";

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    androidChannelId:
      androidChannelId ??
      environment[envName(prefix, "ANDROID_CHANNEL_ID")] ??
      defaultAndroidChannel(prefix),
  };
}

const FCM_CREDENTIAL_SUFFIXES = [
  "SERVICE_ACCOUNT_JSON_BASE64",
  "SERVICE_ACCOUNT_JSON",
  "PROJECT_ID",
  "CLIENT_EMAIL",
  "PRIVATE_KEY",
] as const;

function hasAppSpecificCredentialValues(
  prefix: string,
  environment: FcmEnvironment,
): boolean {
  return FCM_CREDENTIAL_SUFFIXES.some((suffix) =>
    Boolean(environment[envName(prefix, suffix)]?.trim()),
  );
}

export function resolveFcmConfigForApp(
  environment: FcmEnvironment,
  appId?: string | null,
): FcmConfig | null {
  if (environment["FCM_ENABLED"]?.toLowerCase() === "false") return null;

  const prefix = appConfigPrefix(appId);
  if (!prefix) return readFcmConfig(null, environment);
  if (environment[envName(prefix, "ENABLED")]?.toLowerCase() === "false") {
    return null;
  }

  const appChannel =
    environment[envName(prefix, "ANDROID_CHANNEL_ID")]?.trim() ||
    defaultAndroidChannel(prefix);
  const appConfig = readFcmConfig(prefix, environment, appChannel);
  if (appConfig) return appConfig;

  if (hasAppSpecificCredentialValues(prefix, environment)) return null;
  return readFcmConfig(null, environment, appChannel);
}

function getFcmConfig(appId?: string | null): FcmConfig | null {
  return resolveFcmConfigForApp(process.env, appId);
}

export function isFcmConfigured(appId?: string | null): boolean {
  if (typeof appId === "undefined") {
    return Boolean(
      resolveFcmConfigForApp(process.env, "nl.veeleservices.personeel") ??
      resolveFcmConfigForApp(process.env, "nl.fieldgrid.personeel") ??
      resolveFcmConfigForApp(process.env, null),
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
    signal: AbortSignal.timeout(15_000),
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
              collapseKey:
                typeof payload.tag === "string" ? payload.tag.slice(0, 64) : undefined,
              notification: androidNotification,
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
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
