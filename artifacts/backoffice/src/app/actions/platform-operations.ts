"use server";

import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { getPlatformEmailProviderSettings } from "@workspace/db/email-service";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { getPlatformStagingSmokeDashboard } from "./platform-smoke";
import type {
  PlatformSmokeRunHistoryEntry,
  PlatformSmokeStatus,
  PlatformStagingSmokeDashboard,
} from "./platform-smoke.types";

export type PlatformOperationsHealthCategory =
  | "runtime"
  | "data"
  | "integration";

export type PlatformOperationsHealthCheck = {
  id: "backoffice" | "api" | "klant-pwa" | "personeel-pwa" | "database" | "storage" | "mail";
  label: string;
  category: PlatformOperationsHealthCategory;
  status: PlatformSmokeStatus;
  summary: string;
  detail: string;
  endpoint: string | null;
  lastCheckedAt: string;
  responseMs: number | null;
  nextAction: string;
};

export type PlatformOperationsManualRun = {
  id:
    | "staging-read-only"
    | "migration-empty-database"
    | "migration-staging-copy"
    | "final-external-gate"
    | "mutating-demo-cleanup";
  label: string;
  status: PlatformSmokeStatus;
  command: string;
  environment: string;
  cleanupContract: string;
  latestRun: PlatformSmokeRunHistoryEntry | null;
  nextAction: string;
};

export type PlatformOperationsDeployment = {
  environment: string;
  appUrl: string | null;
  siteUrl: string | null;
  backofficeService: string | null;
  apiService: string | null;
  klantService: string | null;
  personeelService: string | null;
  backofficePort: string | null;
  apiPort: string | null;
  klantPort: string | null;
  personeelPort: string | null;
};

export type PlatformOperationsDashboard = {
  generatedAt: string;
  status: PlatformSmokeStatus;
  summary: {
    ok: number;
    warning: number;
    blocked: number;
    manual: number;
  };
  deployment: PlatformOperationsDeployment;
  healthChecks: PlatformOperationsHealthCheck[];
  stagingSmoke: PlatformStagingSmokeDashboard;
  manualRuns: PlatformOperationsManualRun[];
};

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function canonicalFieldgridUrl(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.toLowerCase().includes("dgwebservices.nl")) return normalized;

  return normalized
    .replace(/staging\.veele\.dgwebservices\.nl/giu, "staging.fieldgrid.nl")
    .replace(/app\.veele\.dgwebservices\.nl/giu, "veele.fieldgrid.nl")
    .replace(/veele\.dgwebservices\.nl/giu, "veele.fieldgrid.nl")
    .replace(/dgwebservices\.nl/giu, "fieldgrid.nl");
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function localUrlFromPort(portName: string, path: string): string | null {
  const port = envValue(portName);
  return port ? `http://127.0.0.1:${port}${path}` : null;
}

function firstUrl(candidates: Array<string | null>): string | null {
  return candidates.find((candidate) => Boolean(candidate)) ?? null;
}

async function fetchHealthEndpoint(url: string | null): Promise<{
  status: PlatformSmokeStatus;
  summary: string;
  responseMs: number | null;
}> {
  if (!url) {
    return {
      status: "manual",
      summary: "Geen health endpoint geconfigureerd.",
      responseMs: null,
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const responseMs = Date.now() - startedAt;
    return {
      status: response.ok ? "ok" : "blocked",
      summary: response.ok ? `HTTP ${response.status} in ${responseMs}ms.` : `HTTP ${response.status} op health endpoint.`,
      responseMs,
    };
  } catch (error) {
    return {
      status: "blocked",
      summary: error instanceof Error ? error.message : "Health endpoint kon niet worden bereikt.",
      responseMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function statusCounts(checks: Array<{ status: PlatformSmokeStatus }>): PlatformOperationsDashboard["summary"] {
  return checks.reduce<PlatformOperationsDashboard["summary"]>(
    (counts, check) => {
      counts[check.status] += 1;
      return counts;
    },
    { ok: 0, warning: 0, blocked: 0, manual: 0 },
  );
}

function combinedStatus(checks: Array<{ status: PlatformSmokeStatus }>): PlatformSmokeStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  if (checks.some((check) => check.status === "manual")) return "manual";
  return "ok";
}

async function getMailHealth(generatedAt: string): Promise<PlatformOperationsHealthCheck> {
  const providers = await getPlatformEmailProviderSettings();
  const activeProvider = providers.find((provider) => provider.isActive);
  const status: PlatformSmokeStatus = activeProvider?.configured ? "ok" : "manual";

  return {
    id: "mail",
    label: "Mail",
    category: "integration",
    status,
    summary:
      status === "ok"
        ? `${activeProvider?.name ?? "E-mailprovider"} actief (${activeProvider?.providerType}).`
        : "Geen actieve platform e-mailprovider geconfigureerd.",
    detail: "Controleert of e-mailtransport operationeel geconfigureerd lijkt zonder testmail te versturen.",
    endpoint: null,
    lastCheckedAt: generatedAt,
    responseMs: null,
    nextAction: status === "ok" ? "Draai alleen bij release een echte testmail via instellingen." : "Configureer Resend API of SMTP voordat notificaties live gaan.",
  };
}

async function buildHealthChecks(
  smoke: PlatformStagingSmokeDashboard,
): Promise<PlatformOperationsHealthCheck[]> {
  const generatedAt = new Date().toISOString();
  const apiEndpoint = firstUrl([
    envValue("API_INTERNAL_URL") ? canonicalFieldgridUrl(appendPath(envValue("API_INTERNAL_URL")!, "/api/healthz")) : null,
    localUrlFromPort("API_PORT", "/api/healthz"),
  ]);
  const klantEndpoint = firstUrl([
    envValue("KLANT_PORTAL_URL") ? canonicalFieldgridUrl(appendPath(envValue("KLANT_PORTAL_URL")!, "/healthz")) : null,
    envValue("NEXT_PUBLIC_KLANT_PORTAL_URL") ? canonicalFieldgridUrl(appendPath(envValue("NEXT_PUBLIC_KLANT_PORTAL_URL")!, "/healthz")) : null,
    localUrlFromPort("KLANT_PORT", "/klant/healthz"),
  ]);
  const personeelEndpoint = firstUrl([
    envValue("PERSONEEL_PORTAL_URL") ? canonicalFieldgridUrl(appendPath(envValue("PERSONEEL_PORTAL_URL")!, "/healthz")) : null,
    envValue("NEXT_PUBLIC_PERSONEEL_PORTAL_URL") ? canonicalFieldgridUrl(appendPath(envValue("NEXT_PUBLIC_PERSONEEL_PORTAL_URL")!, "/healthz")) : null,
    localUrlFromPort("PERSONEEL_PORT", "/personeel/healthz"),
  ]);
  const [apiHealth, klantHealth, personeelHealth, mailHealth] = await Promise.all([
    fetchHealthEndpoint(apiEndpoint),
    fetchHealthEndpoint(klantEndpoint),
    fetchHealthEndpoint(personeelEndpoint),
    getMailHealth(generatedAt),
  ]);
  const storageSmoke = smoke.checks.find((check) => check.id === "FG-SMOKE-STORAGE");

  return [
    {
      id: "backoffice",
      label: "Backoffice",
      category: "runtime",
      status: "ok",
      summary: "Platform backoffice heeft deze pagina server-side gerenderd.",
      detail: "Als deze check zichtbaar is, werken auth, server component rendering en de platform databasequery voor operations.",
      endpoint: "/platform/operations",
      lastCheckedAt: generatedAt,
      responseMs: null,
      nextAction: "Controleer bij klachten de systemd service en Caddy upstream voor backoffice.",
    },
    {
      id: "api",
      label: "API",
      category: "runtime",
      ...apiHealth,
      detail: "Probeert de API healthcheck via API_INTERNAL_URL of API_PORT te bereiken.",
      endpoint: apiEndpoint,
      lastCheckedAt: generatedAt,
      nextAction: apiHealth.status === "ok" ? "Geen actie nodig." : "Controleer API_PORT/API_INTERNAL_URL, API service en reverse proxy.",
    },
    {
      id: "klant-pwa",
      label: "Klant-PWA",
      category: "runtime",
      ...klantHealth,
      detail: "Probeert de healthcheck van het klantenportaal via portaal-URL of KLANT_PORT.",
      endpoint: klantEndpoint,
      lastCheckedAt: generatedAt,
      nextAction: klantHealth.status === "ok" ? "Geen actie nodig." : "Controleer KLANT_PORTAL_URL/NEXT_PUBLIC_KLANT_PORTAL_URL/KLANT_PORT en de PWA-service.",
    },
    {
      id: "personeel-pwa",
      label: "Personeel-PWA",
      category: "runtime",
      ...personeelHealth,
      detail: "Probeert de healthcheck van het personeelsportaal via portaal-URL of PERSONEEL_PORT.",
      endpoint: personeelEndpoint,
      lastCheckedAt: generatedAt,
      nextAction: personeelHealth.status === "ok" ? "Geen actie nodig." : "Controleer PERSONEEL_PORTAL_URL/NEXT_PUBLIC_PERSONEEL_PORTAL_URL/PERSONEEL_PORT en de PWA-service.",
    },
    {
      id: "database",
      label: "Database",
      category: "data",
      status: smoke.totals.migrationHistoryTables > 0 ? "ok" : "warning",
      summary: `${smoke.totals.migrationHistoryTables}/2 migration history tabellen gevonden.`,
      detail: "Database is bereikbaar omdat de operations snapshot met tenant- en migration metadata is opgehaald.",
      endpoint: null,
      lastCheckedAt: generatedAt,
      responseMs: null,
      nextAction: smoke.totals.migrationHistoryTables >= 2 ? "Draai migration smoke bij schemawijzigingen." : "Controleer Drizzle en SQL migration history.",
    },
    {
      id: "storage",
      label: "Storage",
      category: "data",
      status: storageSmoke?.status ?? "manual",
      summary: storageSmoke?.summary ?? "Geen storage smoke beschikbaar.",
      detail: "Read-only indicatie uit de staging-smoke: tenant-prefixed documentpaden en legacy path signaal.",
      endpoint: null,
      lastCheckedAt: generatedAt,
      responseMs: null,
      nextAction: storageSmoke?.nextAction ?? "Draai signed URL/path guessing smoke.",
    },
    mailHealth,
  ];
}

function buildManualRuns(smoke: PlatformStagingSmokeDashboard): PlatformOperationsManualRun[] {
  const latestMigration = smoke.runHistory.find((run) => run.kind === "migration-smoke") ?? null;
  const latestStaging = smoke.runHistory.find((run) => run.kind === "staging-smoke") ?? null;

  return [
    {
      id: "staging-read-only",
      label: "Staging smoke read-only",
      status: smoke.checks.some((check) => check.status === "blocked") ? "blocked" : "manual",
      command: "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      environment: "staging",
      cleanupContract: "Read-only: geen cleanup nodig.",
      latestRun: latestStaging,
      nextAction: "Gebruik platform-admin sessiecookie of bearer en publiceer JSON artifact naar artifacts/staging-smoke.",
    },
    {
      id: "migration-empty-database",
      label: "Migration smoke lege database",
      status: smoke.migrationSmoke.targets.find((target) => target.id === "empty-database")?.status ?? "manual",
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target empty-database",
      environment: "disposable empty DB",
      cleanupContract: "Disposable database; nooit tegen staging direct.",
      latestRun: latestMigration,
      nextAction: "Gebruik FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL en confirm empty-database.",
    },
    {
      id: "migration-staging-copy",
      label: "Migration smoke staging-copy",
      status: smoke.migrationSmoke.targets.find((target) => target.id === "staging-copy")?.status ?? "manual",
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target staging-copy",
      environment: "herstelde staging-copy",
      cleanupContract: "Staging-copy mag weg na artifact; staging zelf blijft onaangeraakt.",
      latestRun: latestMigration,
      nextAction: "Gebruik FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL en confirm staging-copy.",
    },
    {
      id: "final-external-gate",
      label: "Final external tenant gate",
      status: smoke.finalExternalTenantGate.status,
      command: smoke.finalExternalTenantGate.command,
      environment: "staging + eerste externe tenant checklist",
      cleanupContract: "Geen mutaties zonder expliciete checklist owner.",
      latestRun: null,
      nextAction: "Werk de go/no-go checklist bij met owner per open uitzondering.",
    },
    {
      id: "mutating-demo-cleanup",
      label: "Mutating smoke met cleanup",
      status: smoke.mutatingChecks.every((check) => check.cleanupStatus === "ready") ? "manual" : "blocked",
      command: "FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only pnpm fieldgrid:sprint15-staging-smoke --run-mutating-demo",
      environment: "field-demo only",
      cleanupContract: "Marker-scoped data moet in dezelfde run worden gerevoked/verwijderd.",
      latestRun: latestStaging,
      nextAction: "Alleen uitvoeren wanneer field-demo gereed is en cleanup selector is vastgelegd.",
    },
  ];
}

function buildDeployment(): PlatformOperationsDeployment {
  return {
    environment: envValue("FIELDGRID_ENV") ?? envValue("NODE_ENV") ?? "unknown",
    appUrl: canonicalFieldgridUrl(envValue("APP_URL") ?? envValue("NEXT_PUBLIC_APP_URL")),
    siteUrl: canonicalFieldgridUrl(envValue("SITE_URL") ?? envValue("NEXT_PUBLIC_SITE_URL")),
    backofficeService: envValue("BACKOFFICE_SERVICE_NAME") ?? envValue("SERVICE_NAME"),
    apiService: envValue("API_SERVICE_NAME"),
    klantService: envValue("KLANT_SERVICE_NAME"),
    personeelService: envValue("PERSONEEL_SERVICE_NAME"),
    backofficePort: envValue("BACKOFFICE_PORT") ?? envValue("PORT"),
    apiPort: envValue("API_PORT"),
    klantPort: envValue("KLANT_PORT"),
    personeelPort: envValue("PERSONEEL_PORT"),
  };
}

export async function getPlatformOperationsDashboard(): Promise<PlatformOperationsDashboard> {
  const stagingSmoke = await getPlatformStagingSmokeDashboard();
  const healthChecks = await buildHealthChecks(stagingSmoke);
  const manualRuns = buildManualRuns(stagingSmoke);
  const summary = statusCounts([...healthChecks, ...stagingSmoke.checks, ...manualRuns]);

  return {
    generatedAt: new Date().toISOString(),
    status: combinedStatus([...healthChecks, ...stagingSmoke.checks, ...manualRuns]),
    summary,
    deployment: buildDeployment(),
    healthChecks,
    stagingSmoke,
    manualRuns,
  };
}

export async function requestPlatformOperationsRerun(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const runId = String(formData.get("runId") ?? "").trim();
  const command = String(formData.get("command") ?? "").trim();
  const cleanupContract = String(formData.get("cleanupContract") ?? "").trim();

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_operations_rerun_requested",
    resource: "platform_operations",
    resourceId: runId || null,
    metadata: {
      command,
      cleanupContract,
      requestedFrom: "/platform/operations",
    },
  });

  revalidatePath("/platform/operations");
}
