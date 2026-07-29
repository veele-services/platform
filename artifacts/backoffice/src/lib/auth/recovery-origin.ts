import "server-only";

import {
  isFieldgridHostAllowedForRuntimeEnvironment,
  resolveCredentialRecoveryOrigin,
  type CredentialRecoverySurface,
} from "@workspace/db";
import { headers } from "next/headers";
import { backofficeUrl } from "@/lib/email";
import {
  isPlatformHost,
  normalizeHost,
  resolveTenantByHost,
} from "@/lib/auth/tenant-resolver";

export type BackofficeRecoveryContext = {
  origin: string;
  surface: Extract<
    CredentialRecoverySurface,
    "tenant-backoffice" | "platform-admin"
  > | null;
  tenantId: string | null;
};

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

function configuredAllowedOrigins(): string[] {
  return (process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}

function isFieldgridOwnedHost(host: string): boolean {
  return host === "fieldgrid.nl" || host.endsWith(".fieldgrid.nl");
}

function isConfiguredPlatformHost(host: string): boolean {
  const configured = process.env["APP_URL"]?.trim();
  if (!configured) return false;
  try {
    return normalizeHost(new URL(configured).hostname) === host;
  } catch {
    throw new Error("APP_URL is ongeldig voor wachtwoordherstel.");
  }
}

export async function resolveBackofficeRecoveryContext(
  configuredUrl: string,
): Promise<BackofficeRecoveryContext> {
  const candidate = new URL(configuredUrl);
  const host = normalizeHost(candidate.hostname);
  const configuredOrigins = configuredAllowedOrigins();
  const appEnvironment = process.env.APP_ENV?.trim().toLowerCase();
  const environmentBound =
    appEnvironment === "staging" || appEnvironment === "production";

  let surface: BackofficeRecoveryContext["surface"] = null;
  let tenantId: string | null = null;

  if (isPlatformHost(host) || isConfiguredPlatformHost(host)) {
    if (
      environmentBound &&
      !isFieldgridHostAllowedForRuntimeEnvironment(host, appEnvironment)
    ) {
      throw new Error(
        "Het platformhersteldomein hoort niet bij de actieve omgeving.",
      );
    }
    surface = "platform-admin";
  } else if (environmentBound) {
    const tenant = await resolveTenantByHost(host);
    if (!tenant) {
      throw new Error(
        "Het tenanthersteldomein is niet actief of hoort niet bij deze omgeving.",
      );
    }
    if (
      !isFieldgridOwnedHost(host) &&
      !configuredOrigins.includes(candidate.origin)
    ) {
      throw new Error(
        "Het externe tenanthersteldomein staat niet in de allowlist.",
      );
    }
    surface = "tenant-backoffice";
    tenantId = tenant.id;
  }

  const automaticallyTrusted = surface !== null;
  const allowedOrigins =
    automaticallyTrusted || configuredOrigins.length === 0
      ? Array.from(new Set([...configuredOrigins, candidate.origin]))
      : configuredOrigins;

  return {
    origin: resolveCredentialRecoveryOrigin({
      configuredOrigin: candidate.origin,
      allowedOrigins,
      allowHttpLocalhost: process.env.NODE_ENV !== "production",
      ...(environmentBound ? { deploymentEnvironment: appEnvironment } : {}),
    }),
    surface,
    tenantId,
  };
}

export async function currentBackofficeRecoveryContext(): Promise<BackofficeRecoveryContext> {
  const requestHeaders = await headers();
  const forwardedHost = firstForwardedValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  if (!forwardedHost) {
    return resolveBackofficeRecoveryContext(backofficeUrl());
  }

  const fallbackProtocol = new URL(backofficeUrl()).protocol.replace(":", "");
  const protocol =
    firstForwardedValue(requestHeaders.get("x-forwarded-proto")) ||
    fallbackProtocol;
  if (protocol !== "https" && protocol !== "http") {
    throw new Error("Ongeldig protocol voor wachtwoordherstel.");
  }

  return resolveBackofficeRecoveryContext(`${protocol}://${forwardedHost}`);
}

export function backofficeRecoveryUrl(
  context: BackofficeRecoveryContext,
): string {
  return `${context.origin}/admin/wachtwoord-vergeten`;
}
