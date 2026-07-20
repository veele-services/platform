#!/usr/bin/env node
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const ports = {
  backoffice: 9321,
  personnel: 9322,
  customer: 9323,
  gateway: 9324,
  orchestrator: 9325,
  postgrest: 9326,
};
export const postgrestImage = "postgrest/postgrest:v12.2.8";
const artifactDir = join(process.cwd(), "artifacts", "fieldgrid-playwright");
const logsDir = join(artifactDir, "logs");
const statusPath = join(artifactDir, "startup-status.json");
const preflightPath = join(artifactDir, "preflight.json");
const proofPath = join(artifactDir, "data-path-proof.json");
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/fieldgrid_runtime_safety";
const configuredDatabaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
const postgrestOrigin =
  process.env.FIELDGRID_E2E_POSTGREST_ORIGIN ??
  `http://127.0.0.1:${ports.postgrest}`;
const jwtMaxLifetimeSeconds = 15 * 60;
const localJwtSecret =
  process.env.FIELDGRID_E2E_JWT_SECRET ??
  "fieldgrid-e2e-only-jwt-secret-minimum-32-bytes-not-for-production";
const localAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "fieldgrid-e2e-local-anon-key-not-for-production";
const localServiceRoleKey =
  "fieldgrid-e2e-local-service-role-not-for-production";
const recoveryOutboxPath = "/tmp/fieldgrid-phase2b-playwright-outbox.jsonl";
const appProbeTimeoutMs = 45_000;
const localFixtureIdentities = {
  tenantAAdmin: {
    userId: "20000000-0000-4000-8000-000000000102",
    email: "admin@tenant-a.runtime.fieldgrid.test",
  },
  tenantAPersonnel: {
    userId: "20000000-0000-4000-8000-000000000104",
    email: "personnel@tenant-a.runtime.fieldgrid.test",
  },
  tenantAPhase2Personnel: {
    userId: "20000000-0000-4000-8000-000000000107",
    email: "phase2-personnel@tenant-a.runtime.fieldgrid.test",
  },
  tenantACustomer: {
    userId: "20000000-0000-4000-8000-000000000105",
    email: "customer@tenant-a.runtime.fieldgrid.test",
  },
  tenantBAdmin: {
    userId: "20000000-0000-4000-8000-000000000202",
    email: "admin@tenant-b.runtime.fieldgrid.test",
  },
  tenantBPersonnel: {
    userId: "20000000-0000-4000-8000-000000000204",
    email: "personnel@tenant-b.runtime.fieldgrid.test",
  },
  tenantBCustomer: {
    userId: "20000000-0000-4000-8000-000000000205",
    email: "customer@tenant-b.runtime.fieldgrid.test",
  },
};
const tenantAAssignment = "70000000-0000-4000-8000-000000000001";
const tenantBAssignment = "70000000-0000-4000-8000-000000000002";
const appBaseEnvironment = { ...process.env };
delete appBaseEnvironment.SUPABASE_SERVICE_ROLE_KEY;
const children = new Map();
let gatewayServer;
let orchestratorServer;
let latestLiveness = { ready: false, checks: [] };
const authProviderProof = {
  passwordUpdates: 0,
  sessionInvalidations: 0,
  legacyCodePasswordDetected: false,
  updatedUsers: new Set(),
};
const molliePaymentsByKey = new Map();
const molliePaymentsById = new Map();
let mollieCreateAttempts = 0;
let pendingLiveness;
let latestPreflight;
let dataPathProof;
let gatewayServiceRoleCredentialRequests = 0;

function quoteForPosixShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commandForLocalScript(command, args) {
  if (process.platform === "win32" && command === "pnpm") {
    return {
      command: "C:\\Program Files\\Git\\bin\\bash.exe",
      args: ["-lc", [command, ...args].map(quoteForPosixShell).join(" ")],
    };
  }
  return { command, args };
}

function redact(text) {
  return String(text)
    .replaceAll(localJwtSecret, "[redacted-jwt-secret]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer [redacted]");
}

async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${redact(JSON.stringify(value, null, 2))}\n`);
  await rename(tmp, path);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createJwt(
  sub,
  offsetSeconds = 0,
  lifetimeSeconds = jwtMaxLifetimeSeconds,
) {
  const identity = Object.values(localFixtureIdentities).find(
    (candidate) => candidate.userId === sub,
  );
  if (!identity)
    throw new Error(
      "Cannot create a local E2E JWT for an unknown fixture identity.",
    );
  const now = Math.floor(Date.now() / 1000) + offsetSeconds;
  const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email: identity.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + lifetimeSeconds })}`;
  const signature = createHmac("sha256", localJwtSecret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function appEnv(port) {
  return {
    ...appBaseEnvironment,
    PORT: String(port),
    DATABASE_URL: configuredDatabaseUrl,
    DB_SSL: "false",
    PGSSLMODE: "disable",
    FIELDGRID_E2E_AUTH_ENABLED: "true",
    FIELDGRID_E2E_OFFLINE_TRANSIENT_SQLSTATE: "40001",
    FIELDGRID_E2E_JWT_SECRET: localJwtSecret,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9324",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: localAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey,
    FIELDGRID_CREDENTIAL_RECOVERY_SECRET:
      "fieldgrid-e2e-credential-recovery-secret-minimum-32-bytes",
    FIELDGRID_EMAIL_TEST_OUTBOX_PATH: recoveryOutboxPath,
    FIELDGRID_RECOVERY_ALLOWED_ORIGINS:
      "http://127.0.0.1:9322,http://127.0.0.1:9323",
    PERSONEEL_PORTAL_URL: "http://127.0.0.1:9322/personeel",
    KLANT_PORTAL_URL: "http://127.0.0.1:9323/klant",
    SESSION_SECRET:
      process.env.SESSION_SECRET ??
      "fieldgrid-e2e-local-session-secret-minimum-32-bytes",
    MOLLIE_API_KEY: "test_fieldgrid_e2e_provider_key",
    MOLLIE_WEBHOOK_SECRET: "fieldgrid-e2e-ingress-hmac-secret",
    MOLLIE_API_BASE_URL: `http://127.0.0.1:${ports.orchestrator}`,
    MOLLIE_WEBHOOK_URL: `http://127.0.0.1:${ports.orchestrator}/mollie-callback`,
    NODE_ENV:
      process.env.NODE_ENV === "production"
        ? "development"
        : (process.env.NODE_ENV ?? "development"),
  };
}

function spawnLogged(name, command, args, env) {
  const stdout = createWriteStream(join(logsDir, `${name}.stdout.log`), {
    flags: "a",
  });
  const stderr = createWriteStream(join(logsDir, `${name}.stderr.log`), {
    flags: "a",
  });
  const resolved = commandForLocalScript(command, args);
  const child = spawn(resolved.command, resolved.args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  children.set(name, child);
  child.once("error", (error) => {
    children.delete(name);
    stderr.write(
      `\n[${name}] spawn error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    stderr.write(`\n[${name}] exited code=${code} signal=${signal}\n`);
  });
  return child;
}

async function tcpReachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 1000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function postgrestUrlForGatewayRequest(requestUrl) {
  const incoming = new URL(requestUrl, "http://fieldgrid-e2e.local");
  const postgrestPath = incoming.pathname.slice("/rest/v1".length) || "/";
  return new URL(`${postgrestPath}${incoming.search}`, postgrestOrigin);
}

function fixtureAuthUser(userId) {
  const identity = Object.values(localFixtureIdentities).find(
    (candidate) => candidate.userId === userId,
  );
  if (!identity) return null;
  return {
    id: identity.userId,
    email: identity.email,
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: "2026-07-18T00:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    app_metadata: { provider: "fieldgrid-e2e", providers: ["email"] },
    user_metadata: { recovery_e2e: true },
    identities: [],
  };
}

async function requestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function recoveryProviderProof() {
  return {
    passwordUpdates: authProviderProof.passwordUpdates,
    sessionInvalidations: authProviderProof.sessionInvalidations,
    legacyCodePasswordDetected: authProviderProof.legacyCodePasswordDetected,
    updatedUsers: [...authProviderProof.updatedUsers].sort(),
  };
}

function startGateway() {
  gatewayServer = http.createServer(async (req, res) => {
    try {
      const authorization = Array.isArray(req.headers.authorization)
        ? req.headers.authorization.join(',')
        : req.headers.authorization ?? '';
      const apiKey = Array.isArray(req.headers.apikey)
        ? req.headers.apikey.join(',')
        : req.headers.apikey ?? '';
      if (authorization.includes(localServiceRoleKey) || apiKey.includes(localServiceRoleKey)) {
        gatewayServiceRoleCredentialRequests += 1;
      }
      if (req.method === "GET" && req.url === "/healthz") {
        const postgrest = await fetchWithTimeout(
          new URL("/", postgrestOrigin),
          {},
          1000,
        )
          .then((r) => r.status < 500)
          .catch(() => false);
        return json(res, postgrest ? 200 : 503, {
          status: postgrest ? "ok" : "postgrest_unreachable",
        });
      }
      const incomingUrl = new URL(req.url ?? "/", "http://fieldgrid-e2e.local");
      if (incomingUrl.pathname.startsWith("/auth/v1/admin/users")) {
        if (req.headers.apikey !== localServiceRoleKey) {
          return json(res, 401, { message: "invalid local service role" });
        }
        const userId = incomingUrl.pathname.split("/").at(-1);
        if (req.method === "GET" && userId === "users") {
          return json(res, 200, {
            users: Object.values(localFixtureIdentities).map((identity) =>
              fixtureAuthUser(identity.userId),
            ),
            aud: "authenticated",
          });
        }
        const user = fixtureAuthUser(userId);
        if (!user) return json(res, 404, { message: "fixture user not found" });
        if (req.method === "GET") return json(res, 200, user);
        if (req.method === "PUT") {
          const body = await requestJson(req);
          if (typeof body.password === "string") {
            authProviderProof.passwordUpdates += 1;
            authProviderProof.sessionInvalidations += 1;
            authProviderProof.legacyCodePasswordDetected ||= /^\d{8}$/u.test(
              body.password,
            );
            authProviderProof.updatedUsers.add(user.id);
          }
          return json(res, 200, {
            ...user,
            app_metadata: body.app_metadata ?? user.app_metadata,
            user_metadata: body.user_metadata ?? user.user_metadata,
          });
        }
        return json(res, 405, { message: "method not allowed" });
      }
      if (!req.url?.startsWith("/rest/v1/"))
        return json(res, 404, { error: "unknown route" });
      const upstream = postgrestUrlForGatewayRequest(req.url);
      const headers = new Headers();
      for (const name of [
        "authorization",
        "apikey",
        "accept",
        "content-type",
        "prefer",
        "range",
        "content-range",
        "accept-profile",
        "content-profile",
      ]) {
        const value = req.headers[name];
        if (Array.isArray(value)) headers.set(name, value.join(","));
        else if (value) headers.set(name, value);
      }
      const body = ["GET", "HEAD"].includes(req.method ?? "GET")
        ? undefined
        : req;
      const upstreamResponse = await fetch(upstream, {
        method: req.method,
        headers,
        body,
        duplex: "half",
      });
      res.statusCode = upstreamResponse.status;
      for (const [name, value] of upstreamResponse.headers) {
        if (
          [
            "content-type",
            "content-range",
            "range-unit",
            "preference-applied",
            "location",
          ].includes(name.toLowerCase())
        )
          res.setHeader(name, value);
      }
      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      json(res, 502, {
        error: "gateway_proxy_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  gatewayServer.listen(ports.gateway, "127.0.0.1");
}

async function gatewayJson(path, jwt, options = {}) {
  const headers = {
    Authorization: `Bearer ${jwt}`,
    apikey: localAnonKey,
    Accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
  };
  return fetchWithTimeout(`http://127.0.0.1:${ports.gateway}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function proveDataPath() {
  const proofStartedAt = new Date().toISOString();
  const tenantACustomerJwt = createJwt(
    localFixtureIdentities.tenantACustomer.userId,
  );
  const tenantBCustomerJwt = createJwt(
    localFixtureIdentities.tenantBCustomer.userId,
  );
  const tenantAPersonnelJwt = createJwt(
    localFixtureIdentities.tenantAPersonnel.userId,
  );
  const tenantBPersonnelJwt = createJwt(
    localFixtureIdentities.tenantBPersonnel.userId,
  );
  const expiredJwt = createJwt(
    localFixtureIdentities.tenantACustomer.userId,
    -3600,
    -60,
  );
  const customerTenantAAllowed = await gatewayJson(
    `/rest/v1/customer_assignment_projection?id=eq.${tenantAAssignment}&select=id`,
    tenantACustomerJwt,
  );
  const customerTenantADeniedTenantB = await gatewayJson(
    `/rest/v1/customer_assignment_projection?id=eq.${tenantBAssignment}&select=id`,
    tenantACustomerJwt,
  );
  const customerTenantBDeniedTenantA = await gatewayJson(
    `/rest/v1/customer_assignment_projection?id=eq.${tenantAAssignment}&select=id`,
    tenantBCustomerJwt,
  );
  const personnelTenantAAssignment = await gatewayJson(
    "/rest/v1/rpc/personnel_assigned_to_assignment",
    tenantAPersonnelJwt,
    { method: "POST", body: { p_assignment_id: tenantAAssignment } },
  );
  const personnelTenantATenantBAssignment = await gatewayJson(
    "/rest/v1/rpc/personnel_assigned_to_assignment",
    tenantAPersonnelJwt,
    { method: "POST", body: { p_assignment_id: tenantBAssignment } },
  );
  const personnelTenantBTenantAAssignment = await gatewayJson(
    "/rest/v1/rpc/personnel_assigned_to_assignment",
    tenantBPersonnelJwt,
    { method: "POST", body: { p_assignment_id: tenantAAssignment } },
  );
  const invalid = await gatewayJson(
    `/rest/v1/customer_assignment_projection?id=eq.${tenantAAssignment}&select=id`,
    expiredJwt,
  );
  for (const [name, response] of [
    ['tenant-a allowed customer query', customerTenantAAllowed],
    ['tenant-a denied tenant-b customer query', customerTenantADeniedTenantB],
    ['tenant-b denied tenant-a customer query', customerTenantBDeniedTenantA],
    ['tenant-a personnel own assignment RPC', personnelTenantAAssignment],
    ['tenant-a personnel tenant-b assignment RPC', personnelTenantATenantBAssignment],
    ['tenant-b personnel tenant-a assignment RPC', personnelTenantBTenantAAssignment],
  ]) {
    if (response.status !== 200) throw new Error(`${name} returned HTTP ${response.status}; RLS denial must be a successful empty/false response.`);
  }
  const customerTenantAAllowedRows = customerTenantAAllowed.ok
    ? await customerTenantAAllowed.json()
    : [];
  const customerTenantADeniedTenantBRows = customerTenantADeniedTenantB.ok
    ? await customerTenantADeniedTenantB.json()
    : [];
  const customerTenantBDeniedTenantARows = customerTenantBDeniedTenantA.ok
    ? await customerTenantBDeniedTenantA.json()
    : [];
  const personnelTenantAAssignmentValue = personnelTenantAAssignment.ok
    ? await personnelTenantAAssignment.json()
    : null;
  const personnelTenantATenantBAssignmentValue =
    personnelTenantATenantBAssignment.ok
      ? await personnelTenantATenantBAssignment.json()
      : null;
  const personnelTenantBTenantAAssignmentValue =
    personnelTenantBTenantAAssignment.ok
      ? await personnelTenantBTenantAAssignment.json()
      : null;
  const completedAt = new Date().toISOString();
  dataPathProof = {
    schemaVersion: "1.0.0",
    name: "fieldgrid-browser-data-path-proof",
    startedAt: proofStartedAt,
    completedAt,
    timestamp: completedAt,
    postgrestVersion: postgrestImage,
    jwtAlgorithm: "HS256",
    jwtRole: "authenticated",
    jwtSub: localFixtureIdentities.tenantACustomer.userId,
    jwtEmail: localFixtureIdentities.tenantACustomer.email,
    jwtMaximumLifetimeSeconds: jwtMaxLifetimeSeconds,
    customerTenantAAllowedAssignmentCount: Array.isArray(
      customerTenantAAllowedRows,
    )
      ? customerTenantAAllowedRows.length
      : 0,
    customerTenantADeniedTenantBAssignmentCount: Array.isArray(
      customerTenantADeniedTenantBRows,
    )
      ? customerTenantADeniedTenantBRows.length
      : 0,
    customerTenantBDeniedTenantAAssignmentCount: Array.isArray(
      customerTenantBDeniedTenantARows,
    )
      ? customerTenantBDeniedTenantARows.length
      : 0,
    personnelTenantAAssignmentAllowed: personnelTenantAAssignmentValue === true,
    personnelTenantATenantBAssignmentDenied:
      personnelTenantATenantBAssignmentValue === false,
    personnelTenantBTenantAAssignmentDenied:
      personnelTenantBTenantAAssignmentValue === false,
    invalidJwtStatus: invalid.status,
    responseStatuses: {
      customerTenantAAllowed: customerTenantAAllowed.status,
      customerTenantADeniedTenantB: customerTenantADeniedTenantB.status,
      customerTenantBDeniedTenantA: customerTenantBDeniedTenantA.status,
      personnelTenantAAssignment: personnelTenantAAssignment.status,
      personnelTenantATenantBAssignment: personnelTenantATenantBAssignment.status,
      personnelTenantBTenantAAssignment: personnelTenantBTenantAAssignment.status,
    },
    gatewayServiceRoleCredentialRequests,
    serviceRoleBrowserBypassDetected: gatewayServiceRoleCredentialRequests > 0,
  };
  const ok =
    dataPathProof.customerTenantAAllowedAssignmentCount === 1 &&
    dataPathProof.customerTenantADeniedTenantBAssignmentCount === 0 &&
    dataPathProof.customerTenantBDeniedTenantAAssignmentCount === 0 &&
    dataPathProof.personnelTenantAAssignmentAllowed &&
    dataPathProof.personnelTenantATenantBAssignmentDenied &&
    dataPathProof.personnelTenantBTenantAAssignmentDenied &&
    dataPathProof.invalidJwtStatus === 401 &&
    dataPathProof.gatewayServiceRoleCredentialRequests === 0;
  dataPathProof.status = ok ? "passed" : "failed";
  dataPathProof.failure = ok ? null : { reason: "One or more data-path assertions failed." };
  await writeAtomicJson(proofPath, dataPathProof);
  return { ok, details: dataPathProof };
}

async function probeApp(name, port, path, host, userId, acceptedStatuses) {
  try {
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${port}${path}`,
      {
        headers: {
          host,
          "x-forwarded-host": host,
          "x-forwarded-proto": "http",
          cookie: `fieldgrid_e2e_auth_user=${encodeURIComponent(userId)}`,
        },
        redirect: "manual",
      },
      appProbeTimeoutMs,
    );
    return {
      name,
      ok: acceptedStatuses.includes(response.status),
      status: response.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: redact(error instanceof Error ? error.message : String(error)),
      checkedAt: new Date().toISOString(),
    };
  }
}

async function probeLivenessApp(name, port, host, path = "/login") {
  try {
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${port}${path}`,
      {
        headers: {
          host,
          "x-forwarded-host": host,
          "x-forwarded-proto": "http",
        },
        redirect: "manual",
      },
      appProbeTimeoutMs,
    );
    return {
      name,
      ok: [200, 302, 307].includes(response.status),
      status: response.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: redact(error instanceof Error ? error.message : String(error)),
      checkedAt: new Date().toISOString(),
    };
  }
}

async function liveness() {
  if (pendingLiveness) return pendingLiveness;
  pendingLiveness = (async () => {
    const checks = [];
    const databaseEndpoint = new URL(configuredDatabaseUrl);
    checks.push({
      name: "postgresql",
      ok: await tcpReachable(
        databaseEndpoint.hostname,
        Number(databaseEndpoint.port || 5432),
      ),
      checkedAt: new Date().toISOString(),
    });
    checks.push({
      name: "postgrest",
      ok: await fetchWithTimeout(new URL("/", postgrestOrigin), {}, 1000)
        .then((r) => r.status >= 200 && r.status < 300)
        .catch(() => false),
      checkedAt: new Date().toISOString(),
    });
    checks.push({
      name: "gateway",
      ok: await fetchWithTimeout(`http://127.0.0.1:${ports.gateway}/healthz`)
        .then((r) => r.status === 200)
        .catch(() => false),
      checkedAt: new Date().toISOString(),
    });
    checks.push(
      await probeLivenessApp(
        "backoffice-login",
        ports.backoffice,
        "tenant-a.runtime.fieldgrid.test",
      ),
    );
    checks.push(
      await probeLivenessApp(
        "personnel-login",
        ports.personnel,
        "tenant-a.runtime.fieldgrid.test",
        "/personeel/login",
      ),
    );
    checks.push(
      await probeLivenessApp(
        "customer-login",
        ports.customer,
        "tenant-a.runtime.fieldgrid.test",
        "/klant/login",
      ),
    );
    latestLiveness = { ready: checks.every((check) => check.ok), checks };
    await writeAtomicJson(statusPath, {
      ...latestLiveness,
      ports,
      artifactDir,
    });
    return latestLiveness;
  })().finally(() => {
    pendingLiveness = null;
  });
  return pendingLiveness;
}

async function authenticatedPreflight() {
  if (latestPreflight) return latestPreflight;

  const checks = [];
  const targets = [
    {
      name: "tenant-a-admin-backoffice",
      port: ports.backoffice,
      path: "/customers",
      host: "tenant-a.runtime.fieldgrid.test",
      userId: localFixtureIdentities.tenantAAdmin.userId,
    },
    {
      name: "tenant-a-personnel",
      port: ports.personnel,
      path: "/personeel/opdrachten",
      host: "tenant-a.runtime.fieldgrid.test",
      userId: localFixtureIdentities.tenantAPersonnel.userId,
    },
    {
      name: "tenant-a-customer",
      port: ports.customer,
      path: "/klant/opdrachten",
      host: "tenant-a.runtime.fieldgrid.test",
      userId: localFixtureIdentities.tenantACustomer.userId,
    },
  ];

  for (const target of targets) {
    const check = await probeApp(
      target.name,
      target.port,
      target.path,
      target.host,
      target.userId,
      [200],
    );
    checks.push(check);
    if (!check.ok) {
      latestPreflight = {
        ready: false,
        failedImmediately: check.status >= 400 && check.status < 600,
        checks,
        completedAt: new Date().toISOString(),
      };
      await writeAtomicJson(preflightPath, latestPreflight);
      return latestPreflight;
    }
  }

  try {
    const proof = await proveDataPath();
    checks.push({
      name: "data-path-proof",
      ok: proof.ok,
      details: proof.details,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    dataPathProof = {
      schemaVersion: "1.0.0",
      name: "fieldgrid-browser-data-path-proof",
      status: "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      postgrestVersion: postgrestImage,
      gatewayServiceRoleCredentialRequests,
      serviceRoleBrowserBypassDetected: gatewayServiceRoleCredentialRequests > 0,
      failure: { reason: message },
    };
    await writeAtomicJson(proofPath, dataPathProof);
    checks.push({
      name: "data-path-proof",
      ok: false,
      error: message,
      checkedAt: new Date().toISOString(),
    });
  }
  latestPreflight = {
    ready: checks.every((check) => check.ok),
    failedImmediately: false,
    checks,
    completedAt: new Date().toISOString(),
  };
  await writeAtomicJson(preflightPath, latestPreflight);
  return latestPreflight;
}

function startOrchestrator() {
  orchestratorServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v2/payments") {
      mollieCreateAttempts += 1;
      const requestKey = req.headers["idempotency-key"];
      if (typeof requestKey !== "string" || requestKey.length < 8) {
        return json(res, 400, { detail: "missing idempotency key" });
      }
      let payment = molliePaymentsByKey.get(requestKey);
      if (!payment) {
        const request = await requestJson(req);
        const id = `tr_fieldgrid_e2e_${String(molliePaymentsByKey.size + 1).padStart(4, "0")}`;
        payment = {
          id,
          status: "open",
          amount: request.amount,
          metadata: request.metadata,
          mode: "test",
          profileId: "pfl_fieldgrid_e2e",
          createdAt: "2026-07-19T12:00:00.000Z",
          _links: {
            checkout: {
              href: `http://127.0.0.1:${ports.orchestrator}/checkout/${id}`,
            },
          },
        };
        molliePaymentsByKey.set(requestKey, payment);
        molliePaymentsById.set(id, payment);
      }
      return json(res, 201, payment);
    }
    const fetchedPaymentId = req.url?.match(
      /^\/v2\/payments\/(tr_[A-Za-z0-9_-]+)$/u,
    )?.[1];
    if (req.method === "GET" && fetchedPaymentId) {
      const payment = molliePaymentsById.get(fetchedPaymentId);
      return payment
        ? json(res, 200, payment)
        : json(res, 404, { detail: "not found" });
    }
    if (req.method === "GET" && req.url?.startsWith("/checkout/")) {
      return json(res, 200, { checkout: "Beveiligde testcheckout" });
    }
    if (req.url === "/payment-provider-proof") {
      return json(res, 200, {
        createAttempts: mollieCreateAttempts,
        uniquePayments: molliePaymentsByKey.size,
        payments: [...molliePaymentsById.values()].map(
          ({ id, amount, metadata }) => ({ id, amount, metadata }),
        ),
      });
    }
    if (req.url === "/healthz") {
      const state = await liveness();
      return json(res, state.ready ? 200 : 503, state);
    }
    if (req.url === "/preflight") {
      try {
        const state = await authenticatedPreflight();
        return json(res, state.ready ? 200 : 503, state);
      } catch (error) {
        latestPreflight = {
          ready: false,
          failedImmediately: false,
          checks: [
            {
              name: "preflight-crash",
              ok: false,
              error: redact(
                error instanceof Error ? error.message : String(error),
              ),
              checkedAt: new Date().toISOString(),
            },
          ],
          completedAt: new Date().toISOString(),
        };
        await writeAtomicJson(preflightPath, latestPreflight);
        return json(res, 503, latestPreflight);
      }
    }
    if (req.url === "/recovery-provider-proof") {
      return json(res, 200, recoveryProviderProof());
    }
    return json(res, 404, { error: "unknown route" });
  });
  orchestratorServer.listen(ports.orchestrator, "127.0.0.1");
}

export async function start() {
  await mkdir(logsDir, { recursive: true });
  await Promise.allSettled([
    rm(statusPath, { force: true }),
    rm(preflightPath, { force: true }),
    rm(proofPath, { force: true }),
    rm(recoveryOutboxPath, { force: true }),
  ]);
  startGateway();
  startOrchestrator();
  spawnLogged(
    "backoffice",
    "pnpm",
    [
      "--filter",
      "@workspace/backoffice",
      "exec",
      "next",
      "dev",
      "-H",
      "127.0.0.1",
      "-p",
      String(ports.backoffice),
    ],
    appEnv(ports.backoffice),
  );
  spawnLogged(
    "personnel",
    "pnpm",
    [
      "--filter",
      "@workspace/personeel-pwa",
      "exec",
      "next",
      "dev",
      "--turbopack",
      "-H",
      "0.0.0.0",
      "-p",
      String(ports.personnel),
    ],
    appEnv(ports.personnel),
  );
  spawnLogged(
    "customer",
    "pnpm",
    [
      "--filter",
      "@workspace/klant-pwa",
      "exec",
      "next",
      "dev",
      "--turbopack",
      "-H",
      "0.0.0.0",
      "-p",
      String(ports.customer),
    ],
    appEnv(ports.customer),
  );
  await writeAtomicJson(statusPath, {
    ready: false,
    status: "starting",
    ports,
    postgrestImage,
    artifactDir,
  });
}

export async function stop() {
  for (const [name, child] of children) {
    child.kill("SIGTERM");
    children.delete(name);
  }
  await Promise.allSettled([
    gatewayServer && new Promise((resolve) => gatewayServer.close(resolve)),
    orchestratorServer &&
      new Promise((resolve) => orchestratorServer.close(resolve)),
  ]);
  await writeAtomicJson(statusPath, {
    ...latestLiveness,
    status: "stopped",
    ports,
    artifactDir,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(async (error) => {
    await writeAtomicJson(statusPath, {
      ready: false,
      error: error instanceof Error ? error.stack : String(error),
    });
    process.exit(1);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => stop().finally(() => process.exit(0)));
  process.on("uncaughtException", (error) =>
    stop().finally(() => {
      throw error;
    }),
  );
  process.on("unhandledRejection", (error) =>
    stop().finally(() => {
      throw error;
    }),
  );
}
