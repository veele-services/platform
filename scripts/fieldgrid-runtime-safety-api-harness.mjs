#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  FIXTURE,
  connect,
  databaseUrl,
  repoRoot,
  result,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

const API_PORT = Number(
  process.env.FIELDGRID_RUNTIME_SAFETY_API_PORT ?? "4177",
);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const JWT_SECRET =
  process.env.FIELDGRID_RUNTIME_SAFETY_JWT_SECRET ??
  "fieldgrid-runtime-safety-local-secret";
const JWT_ISSUER = "https://auth.runtime.fieldgrid.test/auth/v1";
const MOLLIE_MOCK_PORT = Number(
  process.env.FIELDGRID_RUNTIME_SAFETY_MOLLIE_PORT ?? "4178",
);
const MOLLIE_MOCK_URL = `http://127.0.0.1:${MOLLIE_MOCK_PORT}`;
const WEBHOOK_SECRET = "runtime-safety-dummy-webhook-secret";

const WEBHOOK_FIXTURE = {
  valid: {
    mollieId: "tr_runtime_collection_valid",
    batch: "94000000-0000-4000-8000-000000000001",
    payment: "94000000-0000-4000-8000-000000000002",
    assignments: [
      "94000000-0000-4000-8000-000000000003",
      "94000000-0000-4000-8000-000000000004",
    ],
    invoices: [
      "94000000-0000-4000-8000-000000000005",
      "94000000-0000-4000-8000-000000000006",
    ],
  },
  invalid: {
    mollieId: "tr_runtime_collection_invalid",
    batch: "94000000-0000-4000-8000-000000000011",
    payment: "94000000-0000-4000-8000-000000000012",
    assignments: [
      "94000000-0000-4000-8000-000000000013",
      "94000000-0000-4000-8000-000000000014",
    ],
    invoices: [
      "94000000-0000-4000-8000-000000000015",
      "94000000-0000-4000-8000-000000000016",
    ],
  },
};

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(userId, email, overrides = {}) {
  const algorithm = overrides.algorithm ?? "HS256";
  const header = { alg: algorithm, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
    role: "authenticated",
    aud: "authenticated",
    iss: JWT_ISSUER,
    iat: now,
    exp: now + 3600,
    ...(overrides.payload ?? {}),
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const digest = algorithm === "HS512" ? "sha512" : "sha256";
  const signature = crypto
    .createHmac(digest, JWT_SECRET)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function startServer() {
  const child = spawn(
    process.execPath,
    ["--enable-source-maps", "./artifacts/api-server/dist/index.mjs"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl(),
        DB_SSL: "false",
        PGSSLMODE: "disable",
        SUPABASE_JWT_SECRET: JWT_SECRET,
        SUPABASE_JWT_ISSUER: JWT_ISSUER,
        SUPABASE_JWT_AUDIENCE: "authenticated",
        SUPABASE_URL: "",
        MOLLIE_API_KEY: "runtime-safety-dummy-mollie-key",
        MOLLIE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        MOLLIE_API_BASE_URL: MOLLIE_MOCK_URL,
        ADMIN_API_SECRET: "runtime-safety-dummy-admin-secret",
        FCM_ENABLED: "false",
        VAPID_PUBLIC_KEY: "runtime-safety-public",
        VAPID_PRIVATE_KEY: "runtime-safety-private",
        VAPID_SUBJECT: "mailto:runtime-safety@fieldgrid.test",
        LOG_LEVEL: "silent",
      },
    },
  );

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

function startMollieMock() {
  const server = http.createServer((req, res) => {
    const paymentId = req.url?.match(
      /^\/v2\/payments\/(tr_[A-Za-z0-9_-]+)$/u,
    )?.[1];
    if (
      req.method !== "GET" ||
      !paymentId ||
      ![
        WEBHOOK_FIXTURE.valid.mollieId,
        WEBHOOK_FIXTURE.invalid.mollieId,
      ].includes(paymentId)
    ) {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: paymentId,
        status: "paid",
        paidAt: "2026-07-19T10:00:00.000Z",
      }),
    );
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOLLIE_MOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function seedWebhookFixture() {
  const client = await connect();
  const all = [WEBHOOK_FIXTURE.valid, WEBHOOK_FIXTURE.invalid];
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.audit_log
       WHERE resource_id = ANY($1::text[])`,
      [all.map((fixture) => fixture.batch)],
    );
    await client.query(
      `DELETE FROM public.payment_allocations
       WHERE payment_id = ANY($1::uuid[])`,
      [all.map((fixture) => fixture.payment)],
    );
    await client.query(
      `DELETE FROM public.payments WHERE id = ANY($1::uuid[])`,
      [all.map((fixture) => fixture.payment)],
    );
    await client.query(
      `DELETE FROM public.customer_payment_batches WHERE id = ANY($1::uuid[])`,
      [all.map((fixture) => fixture.batch)],
    );
    await client.query(
      `DELETE FROM public.invoices WHERE id = ANY($1::uuid[])`,
      [all.flatMap((fixture) => fixture.invoices)],
    );
    await client.query(
      `DELETE FROM public.assignments WHERE id = ANY($1::uuid[])`,
      [all.flatMap((fixture) => fixture.assignments)],
    );

    for (const [fixtureName, fixture] of Object.entries(WEBHOOK_FIXTURE)) {
      for (const [index, assignmentId] of fixture.assignments.entries()) {
        await client.query(
          `INSERT INTO public.assignments
             (id, tenant_id, code, title, customer_id, object_id, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'invoiced', $7)`,
          [
            assignmentId,
            FIXTURE.tenants.a,
            `RT-WH-${fixtureName.toUpperCase()}-${index + 1}`,
            `Runtime webhook ${fixtureName} ${index + 1}`,
            FIXTURE.customers.a,
            FIXTURE.objects.a,
            FIXTURE.users.tenantAOwner,
          ],
        );
      }

      const invoiceCents =
        fixtureName === "valid" ? [1000, 2000] : [1000, 2500];
      for (const [index, invoiceId] of fixture.invoices.entries()) {
        await client.query(
          `INSERT INTO public.invoices
             (id, tenant_id, invoice_number, customer_id, assignment_id, amount,
              vat_percentage, vat_amount, total_amount, status, due_date,
              payment_status, collection_status, paid_amount, outstanding_amount,
              created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $6, 'sent', CURRENT_DATE + 14,
                   'unpaid', 'collected', 0, $6, $7)`,
          [
            invoiceId,
            FIXTURE.tenants.a,
            `RT-WH-${fixtureName.toUpperCase()}-INV-${index + 1}`,
            FIXTURE.customers.a,
            fixture.assignments[index],
            (invoiceCents[index] / 100).toFixed(2),
            FIXTURE.users.tenantAOwner,
          ],
        );
      }

      await client.query(
        `INSERT INTO public.customer_payment_batches
           (id, tenant_id, customer_id, mollie_payment_id, amount_cents,
            paid_amount_cents, outstanding_amount_cents, status, created_by)
         VALUES ($1, $2, $3, $4, 3000, 0, 3000, 'open', $5)`,
        [
          fixture.batch,
          FIXTURE.tenants.a,
          FIXTURE.customers.a,
          fixture.mollieId,
          FIXTURE.users.tenantAOwner,
        ],
      );
      for (const [index, invoiceId] of fixture.invoices.entries()) {
        await client.query(
          `INSERT INTO public.customer_payment_batch_items
             (tenant_id, batch_id, invoice_id, amount_cents, original_total_amount_cents,
              outstanding_amount_at_collection_cents, included_amount_cents, sort_order)
           VALUES ($1, $2, $3, $4, $4, $4, $4, $5)`,
          [
            FIXTURE.tenants.a,
            fixture.batch,
            invoiceId,
            invoiceCents[index],
            index,
          ],
        );
      }
      await client.query(
        `INSERT INTO public.payments
           (id, tenant_id, customer_id, invoice_id, source_type, source_id,
            mollie_payment_id, amount_cents, amount, status, payment_method)
         VALUES ($1, $2, $3, NULL, 'invoice_collection', $4, $5, 3000, 30, 'open', 'mollie')`,
        [
          fixture.payment,
          FIXTURE.tenants.a,
          FIXTURE.customers.a,
          fixture.batch,
          fixture.mollieId,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function webhookRequest(mollieId) {
  const rawBody = `id=${encodeURIComponent(mollieId)}`;
  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return request("/api/webhooks/mollie", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-mollie-signature": signature,
    },
    body: rawBody,
  });
}

async function webhookState(fixture) {
  const client = await connect();
  try {
    const {
      rows: [state],
    } = await client.query(
      `SELECT
         (SELECT status FROM public.payments WHERE id = $1) AS payment_status,
         (SELECT status FROM public.customer_payment_batches WHERE id = $2) AS batch_status,
         (SELECT count(*)::integer FROM public.payment_allocations WHERE payment_id = $1) AS allocation_count,
         (SELECT coalesce(sum(amount_cents), 0)::integer FROM public.payment_allocations WHERE payment_id = $1) AS allocation_total,
         (SELECT array_agg(status ORDER BY id) FROM public.invoices WHERE id = ANY($3::uuid[])) AS invoice_statuses,
         (SELECT array_agg(status ORDER BY id) FROM public.assignments WHERE id = ANY($4::uuid[])) AS assignment_statuses,
         (SELECT count(*)::integer FROM public.audit_log
            WHERE resource = 'customer_payment_batches' AND resource_id = $2::text
              AND action = 'mollie_payment_batch_received') AS audit_count`,
      [fixture.payment, fixture.batch, fixture.invoices, fixture.assignments],
    );
    return state;
  } finally {
    await client.end();
  }
}

function assertWebhookState(checks, name, actual, expected) {
  const serializedActual = JSON.stringify(actual);
  const serializedExpected = JSON.stringify(expected);
  if (serializedActual !== serializedExpected) {
    throw Object.assign(
      new Error(`${name} produced unexpected durable state`),
      {
        details: { actual, expected },
      },
    );
  }
  checks.push(result(name, "passed", actual));
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
    throw Object.assign(
      new Error(`${name} expected HTTP ${expected}, received ${actual}`),
      {
        details: { actual, expected, ...details },
      },
    );
  }
  checks.push(result(name, "passed", { status: actual, expected, ...details }));
}

async function runApiChecks() {
  const checks = [];
  const tenantAToken = signJwt(
    FIXTURE.users.tenantAOwner,
    "owner@tenant-a.runtime.fieldgrid.test",
  );
  const suspendedToken = signJwt(
    FIXTURE.users.suspendedOwner,
    "owner@suspended.runtime.fieldgrid.test",
  );
  const moduleOffToken = signJwt(
    FIXTURE.users.moduleOffOwner,
    "owner@module-off.runtime.fieldgrid.test",
  );
  const now = Math.floor(Date.now() / 1000);

  const health = await request("/api/healthz");
  assertStatus(checks, "server-action-api-health-contract", health.status, 200);

  const noAuth = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: { "x-forwarded-host": "fieldgrid.nl" },
  });
  assertStatus(checks, "server-action-api-no-auth-denied", noAuth.status, 401);

  for (const [name, token] of [
    [
      "wrong-issuer",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { iss: "https://attacker.invalid/auth/v1" } },
      ),
    ],
    [
      "wrong-audience",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { aud: "service_role" } },
      ),
    ],
    [
      "wrong-role",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { role: "service_role" } },
      ),
    ],
    [
      "wrong-algorithm",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { algorithm: "HS512" },
      ),
    ],
    [
      "expired",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { iat: now - 3600, exp: now - 60 } },
      ),
    ],
    [
      "not-yet-valid",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { nbf: now + 600 } },
      ),
    ],
    [
      "malformed-claims",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { sub: null, iat: "invalid" } },
      ),
    ],
    [
      "excessive-lifetime",
      signJwt(
        FIXTURE.users.tenantAOwner,
        "owner@tenant-a.runtime.fieldgrid.test",
        { payload: { exp: now + 7200 } },
      ),
    ],
    [
      "revoked-session",
      signJwt(
        FIXTURE.users.legacyGlobalManagementOnly,
        "legacy-management-only@runtime.fieldgrid.test",
        { payload: { iat: now - 600 } },
      ),
    ],
  ]) {
    const denied = await request(`/api/customers/${FIXTURE.customers.a}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-forwarded-host": "fieldgrid.nl",
      },
    });
    assertStatus(
      checks,
      `server-action-api-jwt-${name}-denied`,
      denied.status,
      401,
    );
  }

  for (const [name, token] of [
    [
      "wrong-surface",
      signJwt(
        FIXTURE.users.platformOwner,
        "platform-owner@runtime.fieldgrid.test",
      ),
    ],
    [
      "writable-metadata-privilege",
      signJwt(
        FIXTURE.users.platformSupport,
        "platform-support@runtime.fieldgrid.test",
        {
          payload: {
            user_metadata: { role: "owner", tenant_id: FIXTURE.tenants.a },
          },
        },
      ),
    ],
  ]) {
    const denied = await request(`/api/customers/${FIXTURE.customers.a}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-forwarded-host": "fieldgrid.nl",
        "x-fieldgrid-tenant-id": FIXTURE.tenants.a,
      },
    });
    assertStatus(
      checks,
      `server-action-api-jwt-${name}-denied`,
      denied.status,
      403,
    );
  }

  const unknownHost = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      "x-forwarded-host": "unknown.runtime.fieldgrid.nl",
    },
  });
  assertStatus(
    checks,
    "server-action-api-unknown-host-denied",
    unknownHost.status,
    404,
  );

  const crossTenant = await request(`/api/customers/${FIXTURE.customers.b}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      "x-forwarded-host": "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.b,
    },
  });
  assertStatus(
    checks,
    "server-action-api-cross-tenant-header-denied",
    crossTenant.status,
    403,
  );

  const suspended = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${suspendedToken}`,
      "x-forwarded-host": "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.suspended,
    },
  });
  assertStatus(
    checks,
    "server-action-api-suspended-tenant-denied",
    suspended.status,
    403,
  );

  const moduleOff = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${moduleOffToken}`,
      "x-forwarded-host": "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.moduleOff,
    },
  });
  assertStatus(
    checks,
    "server-action-api-module-off-denied",
    moduleOff.status,
    403,
  );

  const validTenantA = await request(`/api/customers/${FIXTURE.customers.a}`, {
    headers: {
      authorization: `Bearer ${tenantAToken}`,
      "x-forwarded-host": "fieldgrid.nl",
      "x-fieldgrid-tenant-id": FIXTURE.tenants.a,
    },
  });
  assertStatus(
    checks,
    "server-action-api-tenant-a-read-allowed",
    validTenantA.status,
    200,
  );

  const concurrentWebhookResponses = await Promise.all([
    webhookRequest(WEBHOOK_FIXTURE.valid.mollieId),
    webhookRequest(WEBHOOK_FIXTURE.valid.mollieId),
  ]);
  for (const [index, response] of concurrentWebhookResponses.entries()) {
    assertStatus(
      checks,
      `server-action-api-collection-webhook-concurrent-${index + 1}`,
      response.status,
      200,
    );
  }
  assertWebhookState(
    checks,
    "server-action-api-collection-webhook-atomic-settlement",
    await webhookState(WEBHOOK_FIXTURE.valid),
    {
      payment_status: "paid",
      batch_status: "paid",
      allocation_count: 2,
      allocation_total: 3000,
      invoice_statuses: ["paid", "paid"],
      assignment_statuses: ["closed", "closed"],
      audit_count: 1,
    },
  );

  const replay = await webhookRequest(WEBHOOK_FIXTURE.valid.mollieId);
  assertStatus(
    checks,
    "server-action-api-collection-webhook-replay",
    replay.status,
    200,
  );
  assertWebhookState(
    checks,
    "server-action-api-collection-webhook-replay-idempotent",
    await webhookState(WEBHOOK_FIXTURE.valid),
    {
      payment_status: "paid",
      batch_status: "paid",
      allocation_count: 2,
      allocation_total: 3000,
      invoice_statuses: ["paid", "paid"],
      assignment_statuses: ["closed", "closed"],
      audit_count: 1,
    },
  );

  const invalid = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-collection-webhook-invalid-total-retry",
    invalid.status,
    500,
  );
  assertWebhookState(
    checks,
    "server-action-api-collection-webhook-invalid-total-rollback",
    await webhookState(WEBHOOK_FIXTURE.invalid),
    {
      payment_status: "open",
      batch_status: "open",
      allocation_count: 0,
      allocation_total: 0,
      invoice_statuses: ["sent", "sent"],
      assignment_statuses: ["invoiced", "invoiced"],
      audit_count: 0,
    },
  );

  return checks;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
}

async function main() {
  const startedAt = new Date().toISOString();
  let mollieMock;
  let server;
  let status = "passed";
  const checks = [];

  try {
    await seedWebhookFixture();
    mollieMock = await startMollieMock();
    server = startServer();
    await waitForHealth();
    checks.push(...(await runApiChecks()));
  } catch (error) {
    status = "failed";
    checks.push(
      result("server-action-api-test-harness", "failed", {
        message: error instanceof Error ? error.message : String(error),
        details: error?.details ?? {},
      }),
    );
    await writeTextArtifact(
      join("logs", "api-harness-error.log"),
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  } finally {
    if (server) await stopServer(server.child).catch(() => {});
    if (mollieMock) await new Promise((resolve) => mollieMock.close(resolve));
    const output = server?.output() ?? { stdout: "", stderr: "" };
    await writeTextArtifact(
      join("logs", "api-server.log"),
      [`--- stdout ---`, output.stdout, `--- stderr ---`, output.stderr].join(
        "\n",
      ),
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
      "server-action-api-cross-tenant-header-denied":
        "API or server-action runtime",
      "server-action-api-suspended-tenant-denied":
        "API or server-action runtime",
      "server-action-api-module-off-denied": "API or server-action runtime",
      "server-action-api-tenant-a-read-allowed": "API or server-action runtime",
      "server-action-api-collection-webhook-atomic-settlement":
        "API or server-action runtime",
      "server-action-api-collection-webhook-replay-idempotent":
        "API or server-action runtime",
      "server-action-api-collection-webhook-invalid-total-rollback":
        "API or server-action runtime",
    },
    limitations: [
      "This starts the local Express API server, a deterministic local Mollie status endpoint, and local JWT verification.",
      "It proves the webhook HTTP boundary and durable database effects without contacting the real payment provider.",
      "It does not prove Next.js server actions, browser flows, a real Mollie account, or Supabase JWKS behavior.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
