#!/usr/bin/env node
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  FIXTURE,
  databaseUrl,
  repoRoot,
  result,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

const API_PORT = Number(process.env.FIELDGRID_RUNTIME_SAFETY_API_PORT ?? "4177");
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const JWT_SECRET = process.env.FIELDGRID_RUNTIME_SAFETY_JWT_SECRET ?? "fieldgrid-runtime-safety-local-secret";

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(userId, email) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function startServer() {
  const child = spawn("node", ["--enable-source-maps", "./artifacts/api-server/dist/index.mjs"], {
    cwd: repoRoot,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(API_PORT),
      DATABASE_URL: databaseUrl(),
      DB_SSL: "false",
      PGSSLMODE: "disable",
      SUPABASE_JWT_SECRET: JWT_SECRET,
      SUPABASE_URL: "",
      MOLLIE_API_KEY: "runtime-safety-dummy-mollie-key",
      MOLLIE_WEBHOOK_SECRET: "runtime-safety-dummy-webhook-secret",
      ADMIN_API_SECRET: "runtime-safety-dummy-admin-secret",
      FCM_ENABLED: "false",
      VAPID_PUBLIC_KEY: "runtime-safety-public",
      VAPID_PRIVATE_KEY: "runtime-safety-private",
      VAPID_SUBJECT: "mailto:runtime-safety@fieldgrid.test",
      LOG_LEVEL: "silent",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { child, output: () => ({ stdout, stderr }) };
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/healthz`);
      if (response.status === 200) return;
      lastError = new Error(`healthz returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Timed out waiting for API health check.");
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  return { status: response.status, body };
}

function assertStatus(checks, name, actual, expected, details = {}) {
  if (actual !== expected) {
    throw Object.assign(new Error(`${name} expected HTTP ${expected}, received ${actual}`), {
      details: { actual, expected, ...details },
    });
  }
  checks.push(result(name, "passed", { status: actual, expected, ...details }));
}

async function runApiChecks() {
  const checks = [];
  const tenantAToken = signJwt(FIXTURE.users.tenantAOwner, "owner@tenant-a.runtime.fieldgrid.test");
  const suspendedToken = signJwt(FIXTURE.users.suspendedOwner, "owner@suspended.runtime.fieldgrid.test");
  const moduleOffToken = signJwt(FIXTURE.users.moduleOffOwner, "owner@module-off.runtime.fieldgrid.test");

  const health = await request("/api/healthz");
  assertStatus(checks, "server-action-api-health-contract", health.status, 200);

  const noAuth = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: { host: "fieldgrid.nl" },
  });
  assertStatus(checks, "server-action-api-no-auth-denied", noAuth.status, 401);

  const unknownHost = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      host: "unknown.runtime.fieldgrid.nl",
    },
  });
  assertStatus(checks, "server-action-api-unknown-host-denied", unknownHost.status, 404);

  const crossTenant = await request(`/api/customers/${FIXTURE.customers.b}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      host: "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.b,
    },
  });
  assertStatus(checks, "server-action-api-cross-tenant-header-denied", crossTenant.status, 403);

  const suspended = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${suspendedToken}`,
      host: "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.suspended,
    },
  });
  assertStatus(checks, "server-action-api-suspended-tenant-denied", suspended.status, 403);

  const moduleOff = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${moduleOffToken}`,
      host: "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.moduleOff,
    },
  });
  assertStatus(checks, "server-action-api-module-off-denied", moduleOff.status, 403);

  const validTenantA = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      host: "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.a,
    },
  });
  assertStatus(checks, "server-action-api-tenant-a-read-allowed", validTenantA.status, 200);

  return checks;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
}

async function main() {
  const startedAt = new Date().toISOString();
  const server = startServer();
  let status = "passed";
  const checks = [];

  try {
    await waitForHealth();
    checks.push(...(await runApiChecks()));
  } catch (error) {
    status = "failed";
    checks.push(result("server-action-api-test-harness", "failed", {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? {},
    }));
    await writeTextArtifact(
      join("logs", "api-harness-error.log"),
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  } finally {
    await stopServer(server.child).catch(() => {});
    const output = server.output();
    await writeTextArtifact(
      join("logs", "api-server.log"),
      [`--- stdout ---`, output.stdout, `--- stderr ---`, output.stderr].join("\n"),
    );
  }

  await writeJsonArtifact(join("reports", "api-harness.json"), {
    name: "fieldgrid-runtime-safety-api-harness",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    baseUrl: API_BASE_URL,
    checks,
    testLayerClassification: {
      "server-action-api-health-contract": "API or server-action runtime",
      "server-action-api-no-auth-denied": "API or server-action runtime",
      "server-action-api-unknown-host-denied": "API or server-action runtime",
      "server-action-api-cross-tenant-header-denied": "API or server-action runtime",
      "server-action-api-suspended-tenant-denied": "API or server-action runtime",
      "server-action-api-module-off-denied": "API or server-action runtime",
      "server-action-api-tenant-a-read-allowed": "API or server-action runtime",
    },
    limitations: [
      "This starts the local Express API server and local JWT verification only.",
      "It does not prove Next.js server actions, browser flows, provider webhooks, or Supabase JWKS behavior.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
