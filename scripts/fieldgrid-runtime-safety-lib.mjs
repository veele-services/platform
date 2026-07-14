#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const repoRoot = join(__dirname, "..");
export const runtimeArtifactDir = join(repoRoot, "artifacts", "runtime-safety-harness");
export const runtimeLogDir = join(runtimeArtifactDir, "logs");
export const runtimeReportDir = join(runtimeArtifactDir, "reports");
export const runtimeSchemaDir = join(runtimeArtifactDir, "schema");

export const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
export const { Client } = dbRequire("pg");

export const FIXTURE = {
  tenants: {
    a: "10000000-0000-4000-8000-000000000001",
    b: "10000000-0000-4000-8000-000000000002",
    suspended: "10000000-0000-4000-8000-000000000003",
    moduleOff: "10000000-0000-4000-8000-000000000004",
  },
  users: {
    platformOwner: "20000000-0000-4000-8000-000000000001",
    platformAdmin: "20000000-0000-4000-8000-000000000002",
    platformSupport: "20000000-0000-4000-8000-000000000003",
    tenantAOwner: "20000000-0000-4000-8000-000000000101",
    tenantAAdmin: "20000000-0000-4000-8000-000000000102",
    tenantAPlanner: "20000000-0000-4000-8000-000000000103",
    tenantAPersonnel: "20000000-0000-4000-8000-000000000104",
    tenantACustomer: "20000000-0000-4000-8000-000000000105",
    tenantAInactivePersonnel: "20000000-0000-4000-8000-000000000106",
    tenantBOwner: "20000000-0000-4000-8000-000000000201",
    tenantBAdmin: "20000000-0000-4000-8000-000000000202",
    tenantBPlanner: "20000000-0000-4000-8000-000000000203",
    tenantBPersonnel: "20000000-0000-4000-8000-000000000204",
    tenantBCustomer: "20000000-0000-4000-8000-000000000205",
    multiTenant: "20000000-0000-4000-8000-000000000301",
    legacyGlobalManagementOnly: "20000000-0000-4000-8000-000000000302",
    suspendedOwner: "20000000-0000-4000-8000-000000000401",
    moduleOffOwner: "20000000-0000-4000-8000-000000000501",
  },
  platformUsers: {
    owner: "30000000-0000-4000-8000-000000000001",
    admin: "30000000-0000-4000-8000-000000000002",
    support: "30000000-0000-4000-8000-000000000003",
  },
  customers: {
    a: "40000000-0000-4000-8000-000000000001",
    b: "40000000-0000-4000-8000-000000000002",
  },
  objects: {
    a: "50000000-0000-4000-8000-000000000001",
    b: "50000000-0000-4000-8000-000000000002",
  },
  personnel: {
    a: "60000000-0000-4000-8000-000000000001",
    inactiveA: "60000000-0000-4000-8000-000000000003",
    b: "60000000-0000-4000-8000-000000000002",
  },
  assignments: {
    a: "70000000-0000-4000-8000-000000000001",
    b: "70000000-0000-4000-8000-000000000002",
  },
  supportGrantExpired: "80000000-0000-4000-8000-000000000001",
  tenantOwnerInviteExpired: "80000000-0000-4000-8000-000000000002",
};

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for the runtime safety harness.");
  }

  const parsed = new URL(value);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const blockedHostPattern = /(?:supabase|fieldgrid\.nl|staging|production|prod)/iu;
  if (blockedHostPattern.test(parsed.hostname)) {
    throw new Error(`Refusing live-like DATABASE_URL host "${parsed.hostname}" for the runtime safety harness.`);
  }
  if (
    process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_NONLOCAL !== "1" &&
    !allowedHosts.has(parsed.hostname)
  ) {
    throw new Error(
      `Refusing non-local DATABASE_URL host "${parsed.hostname}". Set FIELDGRID_RUNTIME_SAFETY_ALLOW_NONLOCAL=1 only for a deliberate local-compatible harness.`,
    );
  }

  return value;
}

export async function assertDisposableDatabaseForReset(client) {
  const database = await client.query(`select current_database() as database_name`);
  const databaseName = database.rows[0]?.database_name ?? "";
  const confirm = process.env.FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM;
  if (
    databaseName !== "fieldgrid_runtime_safety" &&
    databaseName !== "fieldgrid_runtime_safety_test" &&
    confirm !== databaseName
  ) {
    throw new Error(
      `Refusing destructive reset for database "${databaseName}". Use a fieldgrid_runtime_safety database or set FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM to the exact local disposable database name.`,
    );
  }
}

export async function connect() {
  const client = new Client({
    connectionString: databaseUrl(),
    ssl: false,
  });
  await client.connect();
  return client;
}

export async function ensureArtifactDirs() {
  await mkdir(runtimeLogDir, { recursive: true });
  await mkdir(runtimeReportDir, { recursive: true });
  await mkdir(runtimeSchemaDir, { recursive: true });
}

export async function writeJsonArtifact(relativePath, payload) {
  await ensureArtifactDirs();
  const path = join(runtimeArtifactDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${redactArtifactText(JSON.stringify(payload, null, 2))}\n`);
}

export async function writeTextArtifact(relativePath, text) {
  await ensureArtifactDirs();
  const path = join(runtimeArtifactDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, redactArtifactText(text));
}

export function redactArtifactText(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, "postgresql://[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted-jwt]")
    .replace(
      /("(?:service_role|api[_-]?key|webhook[_-]?secret|smtp[_-]?password|admin[_-]?secret|jwt[_-]?secret|vapid[_-]?(?:public|private)?[_-]?key)"\s*:\s*)"[^"]*"/giu,
      '$1"[redacted]"',
    )
    .replace(
      /\b((?:SERVICE_ROLE|API_KEY|WEBHOOK_SECRET|SMTP_PASSWORD|ADMIN_SECRET|JWT_SECRET|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=)[^\s]+/giu,
      "$1[redacted]",
    );
}

export async function tableExists(client, schemaName, tableName) {
  const result = await client.query(
    `select exists (
       select 1
       from information_schema.tables
       where table_schema = $1 and table_name = $2
     ) as exists`,
    [schemaName, tableName],
  );
  return result.rows[0]?.exists === true;
}

export async function columnExists(client, tableName, columnName, schemaName = "public") {
  const result = await client.query(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = $1 and table_name = $2 and column_name = $3
     ) as exists`,
    [schemaName, tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

export function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

export function result(name, status, details = {}) {
  return {
    name,
    status,
    details,
    checkedAt: new Date().toISOString(),
  };
}
