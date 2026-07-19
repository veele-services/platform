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
const providerOverrides = new Map();

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
const DIRECT_WEBHOOK_FIXTURE = {
  mollieId: "tr_runtime_direct_valid",
  payment: "94000000-0000-4000-8000-000000000021",
  assignment: "94000000-0000-4000-8000-000000000022",
  invoice: "94000000-0000-4000-8000-000000000023",
  manualPayment: "94000000-0000-4000-8000-000000000024",
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

async function verifyMissingWebhookSecretFailsStartup() {
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(API_PORT + 20),
    DATABASE_URL: databaseUrl(),
    DB_SSL: "false",
    PGSSLMODE: "disable",
    MOLLIE_API_KEY: "runtime-safety-dummy-mollie-key",
    LOG_LEVEL: "silent",
  };
  delete env.MOLLIE_WEBHOOK_SECRET;
  const child = spawn(
    process.execPath,
    ["--enable-source-maps", "./artifacts/api-server/dist/index.mjs"],
    { cwd: repoRoot, env },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("API did not fail closed without MOLLIE_WEBHOOK_SECRET."),
          ),
        5_000,
      ),
    ),
  ]);
  if (exitCode === 0)
    throw new Error("API started successfully without MOLLIE_WEBHOOK_SECRET.");
  return { exitCode, secretRedacted: !stderr.includes(WEBHOOK_SECRET) };
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
        DIRECT_WEBHOOK_FIXTURE.mollieId,
      ].includes(paymentId)
    ) {
      res.writeHead(404).end();
      return;
    }

    const fixture = [
      ...Object.values(WEBHOOK_FIXTURE),
      DIRECT_WEBHOOK_FIXTURE,
    ].find((candidate) => candidate.mollieId === paymentId);
    const override = providerOverrides.get(paymentId) ?? {};
    if (override.httpStatus) {
      res.writeHead(override.httpStatus, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ detail: "deterministic provider failure" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: override.responseId ?? paymentId,
        status: override.status ?? "paid",
        amount: {
          currency: override.currency ?? "EUR",
          value:
            override.amountValue ??
            (paymentId === DIRECT_WEBHOOK_FIXTURE.mollieId ? "25.00" : "30.00"),
        },
        metadata: {
          schemaVersion: override.schemaVersion ?? "fieldgrid-payment-v1",
          purpose:
            override.purpose ??
            (paymentId === DIRECT_WEBHOOK_FIXTURE.mollieId
              ? "invoice_payment"
              : "invoice_collection_payment"),
          paymentIntentId: override.paymentIntentId ?? fixture.payment,
          tenantId: override.tenantId ?? FIXTURE.tenants.a,
          customerId: override.customerId ?? FIXTURE.customers.a,
          sourceType:
            override.sourceType ??
            (paymentId === DIRECT_WEBHOOK_FIXTURE.mollieId
              ? "invoice"
              : "invoice_collection"),
          sourceId: override.sourceId ?? fixture.batch ?? fixture.invoice,
        },
        mode: override.mode ?? "test",
        profileId: override.profileId ?? "pfl_runtime_safety",
        createdAt: "2026-07-19T09:59:00.000Z",
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
      [
        [
          ...all.flatMap((fixture) => [fixture.batch, fixture.payment]),
          DIRECT_WEBHOOK_FIXTURE.payment,
        ],
      ],
    );
    await client.query(
      `DELETE FROM public.payment_allocations
       WHERE payment_id = ANY($1::uuid[])`,
      [
        [
          ...all.map((fixture) => fixture.payment),
          DIRECT_WEBHOOK_FIXTURE.payment,
          DIRECT_WEBHOOK_FIXTURE.manualPayment,
        ],
      ],
    );
    await client.query(
      `DELETE FROM public.payments WHERE id = ANY($1::uuid[])`,
      [
        [
          ...all.map((fixture) => fixture.payment),
          DIRECT_WEBHOOK_FIXTURE.payment,
          DIRECT_WEBHOOK_FIXTURE.manualPayment,
        ],
      ],
    );
    await client.query(
      `DELETE FROM public.customer_payment_batches WHERE id = ANY($1::uuid[])`,
      [all.map((fixture) => fixture.batch)],
    );
    await client.query(
      `DELETE FROM public.invoices WHERE id = ANY($1::uuid[])`,
      [
        [
          ...all.flatMap((fixture) => fixture.invoices),
          DIRECT_WEBHOOK_FIXTURE.invoice,
        ],
      ],
    );
    await client.query(
      `DELETE FROM public.assignments WHERE id = ANY($1::uuid[])`,
      [
        [
          ...all.flatMap((fixture) => fixture.assignments),
          DIRECT_WEBHOOK_FIXTURE.assignment,
        ],
      ],
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
            mollie_payment_id, provider_request_key, request_hash,
            expected_provider_metadata, provider_status, provider_mode,
            provider_profile_id, amount_cents, amount, status, payment_method)
         VALUES ($1, $2, $3, NULL, 'invoice_collection', $4, $5, gen_random_uuid(),
                 md5($1::uuid::text) || md5('fieldgrid|' || $1::uuid::text),
                 jsonb_build_object(
                   'schemaVersion', 'fieldgrid-payment-v1',
                   'purpose', 'invoice_collection_payment',
                   'paymentIntentId', $1::uuid::text,
                   'tenantId', $2::uuid::text,
                   'customerId', $3::uuid::text,
                   'sourceType', 'invoice_collection',
                   'sourceId', $4::uuid::text
                 ), 'open', 'test', 'pfl_runtime_safety',
                 3000, 30, 'open', 'mollie')`,
        [
          fixture.payment,
          FIXTURE.tenants.a,
          FIXTURE.customers.a,
          fixture.batch,
          fixture.mollieId,
        ],
      );
    }
    await client.query(
      `INSERT INTO public.assignments
         (id, tenant_id, code, title, customer_id, object_id, status, created_by)
       VALUES ($1, $2, 'RT-WH-DIRECT', 'Runtime direct partial payment', $3, $4, 'invoiced', $5)`,
      [
        DIRECT_WEBHOOK_FIXTURE.assignment,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        FIXTURE.objects.a,
        FIXTURE.users.tenantAOwner,
      ],
    );
    await client.query(
      `INSERT INTO public.invoices
         (id, tenant_id, invoice_number, customer_id, assignment_id, amount,
          vat_percentage, vat_amount, total_amount, status, due_date,
          payment_status, paid_amount, outstanding_amount, created_by)
       VALUES ($1, $2, 'RT-WH-DIRECT-INV', $3, $4, 40, 0, 0, 40, 'sent', CURRENT_DATE + 14,
               'partially_paid', 15, 25, $5)`,
      [
        DIRECT_WEBHOOK_FIXTURE.invoice,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        DIRECT_WEBHOOK_FIXTURE.assignment,
        FIXTURE.users.tenantAOwner,
      ],
    );
    await client.query(
      `INSERT INTO public.payments
         (id, tenant_id, customer_id, invoice_id, source_type, source_id,
          amount_cents, amount, status, payment_method, paid_at)
       VALUES ($1, $2, $3, $4, 'invoice', $4, 1500, 15, 'paid', 'manual_bank', now())`,
      [
        DIRECT_WEBHOOK_FIXTURE.manualPayment,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        DIRECT_WEBHOOK_FIXTURE.invoice,
      ],
    );
    await client.query(
      `INSERT INTO public.payment_allocations
         (tenant_id, payment_id, invoice_id, amount_cents, amount, note)
       VALUES ($1, $2, $3, 1500, 15, 'Runtime partial manual allocation')`,
      [
        FIXTURE.tenants.a,
        DIRECT_WEBHOOK_FIXTURE.manualPayment,
        DIRECT_WEBHOOK_FIXTURE.invoice,
      ],
    );
    await client.query(
      `INSERT INTO public.payments
         (id, tenant_id, customer_id, invoice_id, source_type, source_id,
          mollie_payment_id, provider_request_key, request_hash,
          expected_provider_metadata, provider_status, provider_mode,
          provider_profile_id, amount_cents, amount, status, payment_method)
       VALUES ($1, $2, $3, $4, 'invoice', $4, $5, gen_random_uuid(),
               md5($1::uuid::text) || md5('fieldgrid|' || $1::uuid::text),
               jsonb_build_object('schemaVersion', 'fieldgrid-payment-v1',
                 'purpose', 'invoice_payment', 'paymentIntentId', $1::uuid::text,
                 'tenantId', $2::uuid::text, 'customerId', $3::uuid::text,
                 'sourceType', 'invoice', 'sourceId', $4::uuid::text),
               'open', 'test', 'pfl_runtime_safety', 2500, 25, 'open', 'mollie')`,
      [
        DIRECT_WEBHOOK_FIXTURE.payment,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        DIRECT_WEBHOOK_FIXTURE.invoice,
        DIRECT_WEBHOOK_FIXTURE.mollieId,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function webhookRequest(mollieId, options = {}) {
  const rawBody = options.rawBody ?? `id=${encodeURIComponent(mollieId)}`;
  const signature =
    options.signature ??
    crypto
      .createHmac("sha256", options.secret ?? WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (!options.omitSignature) headers["x-mollie-signature"] = signature;
  return request("/api/webhooks/mollie", {
    method: "POST",
    headers,
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
            WHERE resource = 'payments' AND resource_id = $1::text
              AND action = 'apply_verified_provider_payment') AS audit_count,
         (SELECT reconciliation_reason FROM public.payments WHERE id = $1) AS reconciliation_reason`,
      [fixture.payment, fixture.batch, fixture.invoices, fixture.assignments],
    );
    return state;
  } finally {
    await client.end();
  }
}

async function directWebhookState() {
  const client = await connect();
  try {
    const {
      rows: [state],
    } = await client.query(
      `SELECT
         (SELECT status FROM public.payments WHERE id = $1) AS payment_status,
         (SELECT count(*)::integer FROM public.payment_allocations WHERE payment_id = $1) AS allocation_count,
         (SELECT coalesce(sum(amount_cents), 0)::integer FROM public.payment_allocations WHERE payment_id = $1) AS allocation_total,
         (SELECT paid_amount::text FROM public.invoices WHERE id = $2) AS paid_amount,
         (SELECT outstanding_amount::text FROM public.invoices WHERE id = $2) AS outstanding_amount,
         (SELECT status FROM public.invoices WHERE id = $2) AS invoice_status,
         (SELECT status FROM public.assignments WHERE id = $3) AS assignment_status,
         (SELECT count(*)::integer FROM public.audit_log
            WHERE resource = 'payments' AND resource_id = $1::text
              AND action = 'apply_verified_provider_payment') AS audit_count`,
      [
        DIRECT_WEBHOOK_FIXTURE.payment,
        DIRECT_WEBHOOK_FIXTURE.invoice,
        DIRECT_WEBHOOK_FIXTURE.assignment,
      ],
    );
    return state;
  } finally {
    await client.end();
  }
}

async function paymentAuditCount(paymentId, action, discriminator = null) {
  const client = await connect();
  try {
    const {
      rows: [row],
    } = await client.query(
      `SELECT count(*)::integer AS count
       FROM public.audit_log
       WHERE resource = 'payments' AND resource_id = $1::text AND action = $2
         AND ($3::text IS NULL OR metadata->>'discriminator' = $3)`,
      [paymentId, action, discriminator],
    );
    return Number(row?.count ?? 0);
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

  const missingSignature = await webhookRequest(
    DIRECT_WEBHOOK_FIXTURE.mollieId,
    { omitSignature: true },
  );
  assertStatus(
    checks,
    "server-action-api-webhook-missing-signature-denied",
    missingSignature.status,
    400,
  );
  const invalidSignature = await webhookRequest(
    DIRECT_WEBHOOK_FIXTURE.mollieId,
    { signature: "0".repeat(64) },
  );
  assertStatus(
    checks,
    "server-action-api-webhook-invalid-signature-denied",
    invalidSignature.status,
    400,
  );
  const malformedReference = await webhookRequest("invalid-reference");
  assertStatus(
    checks,
    "server-action-api-webhook-malformed-provider-id-denied",
    malformedReference.status,
    400,
  );
  const unknownReference = await webhookRequest("tr_runtime_unknown_payment");
  assertStatus(
    checks,
    "server-action-api-webhook-unknown-provider-id-retryable",
    unknownReference.status,
    502,
  );

  providerOverrides.set(DIRECT_WEBHOOK_FIXTURE.mollieId, { httpStatus: 503 });
  const fetchFailure = await webhookRequest(DIRECT_WEBHOOK_FIXTURE.mollieId);
  assertStatus(
    checks,
    "server-action-api-webhook-provider-fetch-failure-retryable",
    fetchFailure.status,
    502,
  );
  assertWebhookState(
    checks,
    "server-action-api-provider-fetch-failure-no-financial-mutation",
    await directWebhookState(),
    {
      payment_status: "open",
      allocation_count: 0,
      allocation_total: 0,
      paid_amount: "15.00",
      outstanding_amount: "25.00",
      invoice_status: "sent",
      assignment_status: "invoiced",
      audit_count: 0,
    },
  );
  providerOverrides.set(DIRECT_WEBHOOK_FIXTURE.mollieId, {
    responseId: "tr_runtime_different_payment",
  });
  const wrongProviderId = await webhookRequest(DIRECT_WEBHOOK_FIXTURE.mollieId);
  assertStatus(
    checks,
    "server-action-api-webhook-wrong-provider-id-retryable",
    wrongProviderId.status,
    502,
  );
  providerOverrides.delete(DIRECT_WEBHOOK_FIXTURE.mollieId);

  const direct = await webhookRequest(DIRECT_WEBHOOK_FIXTURE.mollieId);
  assertStatus(
    checks,
    "server-action-api-direct-partial-webhook",
    direct.status,
    200,
    { body: direct.body },
  );
  assertWebhookState(
    checks,
    "server-action-api-direct-partial-exact-outstanding-settlement",
    await directWebhookState(),
    {
      payment_status: "paid",
      allocation_count: 1,
      allocation_total: 2500,
      paid_amount: "40.00",
      outstanding_amount: "0.00",
      invoice_status: "paid",
      assignment_status: "closed",
      audit_count: 1,
    },
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
      reconciliation_reason: null,
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
      reconciliation_reason: null,
    },
  );

  providerOverrides.set(WEBHOOK_FIXTURE.valid.mollieId, { status: "failed" });
  const stale = await webhookRequest(WEBHOOK_FIXTURE.valid.mollieId);
  assertStatus(
    checks,
    "server-action-api-paid-status-cannot-regress",
    stale.status,
    200,
  );
  assertWebhookState(
    checks,
    "server-action-api-paid-status-remains-terminal",
    await webhookState(WEBHOOK_FIXTURE.valid),
    {
      payment_status: "paid",
      batch_status: "paid",
      allocation_count: 2,
      allocation_total: 3000,
      invoice_statuses: ["paid", "paid"],
      assignment_statuses: ["closed", "closed"],
      audit_count: 1,
      reconciliation_reason: null,
    },
  );
  providerOverrides.delete(WEBHOOK_FIXTURE.valid.mollieId);

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    status: "pending",
  });
  const pending = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-open-to-pending",
    pending.status,
    200,
  );
  const duplicatePending = await webhookRequest(
    WEBHOOK_FIXTURE.invalid.mollieId,
  );
  assertStatus(
    checks,
    "server-action-api-provider-pending-duplicate",
    duplicatePending.status,
    200,
  );
  if (
    (await paymentAuditCount(
      WEBHOOK_FIXTURE.invalid.payment,
      "observe_provider_payment_status",
      "pending",
    )) !== 1
  ) {
    throw new Error(
      "Duplicate pending provider callbacks produced a duplicate audit observation.",
    );
  }
  checks.push(
    result("server-action-api-provider-pending-audited-once", "passed"),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    status: "authorized",
  });
  const authorized = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-pending-to-authorized",
    authorized.status,
    200,
  );
  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, { status: "open" });
  const staleOpen = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-authorized-stale-open-ignored",
    staleOpen.status,
    200,
  );
  const afterStaleOpen = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    afterStaleOpen.payment_status !== "authorized" ||
    afterStaleOpen.allocation_count !== 0
  ) {
    throw Object.assign(
      new Error("Stale open callback regressed an authorized payment."),
      { details: afterStaleOpen },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-authorized-monotonic",
      "passed",
      afterStaleOpen,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    status: "unexpected_provider_state",
  });
  const unknownStatus = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-unknown-status-acknowledged-without-mutation",
    unknownStatus.status,
    200,
  );
  const afterUnknownStatus = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    afterUnknownStatus.payment_status !== "authorized" ||
    afterUnknownStatus.allocation_count !== 0
  ) {
    throw Object.assign(
      new Error("Unknown provider status mutated financial state."),
      { details: afterUnknownStatus },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-unknown-status-no-mutation",
      "passed",
      afterUnknownStatus,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, { mode: "live" });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const modeMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (modeMismatch.reconciliation_reason !== "Provider mode mismatch.") {
    throw Object.assign(
      new Error("provider mode mismatch was not quarantined"),
      { details: modeMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-mode-mismatch-quarantined",
      "passed",
      modeMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    profileId: "pfl_wrong_profile",
  });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const profileMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (profileMismatch.reconciliation_reason !== "Provider profile mismatch.") {
    throw Object.assign(
      new Error("provider profile mismatch was not quarantined"),
      { details: profileMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-profile-mismatch-quarantined",
      "passed",
      profileMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    tenantId: FIXTURE.tenants.b,
  });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const tenantMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    !tenantMismatch.reconciliation_reason?.includes(
      "metadata mismatch for tenantId",
    )
  ) {
    throw Object.assign(
      new Error("provider tenant mismatch was not quarantined"),
      { details: tenantMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-tenant-mismatch-quarantined",
      "passed",
      tenantMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    customerId: FIXTURE.customers.b,
  });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const customerMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    !customerMismatch.reconciliation_reason?.includes(
      "metadata mismatch for customerId",
    )
  ) {
    throw Object.assign(
      new Error("provider customer mismatch was not quarantined"),
      { details: customerMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-customer-mismatch-quarantined",
      "passed",
      customerMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    amountValue: "31.00",
  });
  const invalid = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-amount-mismatch-quarantined",
    invalid.status,
    200,
    { body: invalid.body },
  );
  assertWebhookState(
    checks,
    "server-action-api-provider-mismatch-no-financial-mutation",
    await webhookState(WEBHOOK_FIXTURE.invalid),
    {
      payment_status: "reconciliation_required",
      batch_status: "open",
      allocation_count: 0,
      allocation_total: 0,
      invoice_statuses: ["sent", "sent"],
      assignment_statuses: ["invoiced", "invoiced"],
      audit_count: 0,
      reconciliation_reason: "Provider amount mismatch.",
    },
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, { currency: "USD" });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const currencyMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    currencyMismatch.reconciliation_reason !== "Provider currency mismatch."
  ) {
    throw Object.assign(
      new Error("provider currency mismatch was not quarantined"),
      { details: currencyMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-currency-mismatch-quarantined",
      "passed",
      currencyMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    sourceId: WEBHOOK_FIXTURE.valid.batch,
  });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const metadataMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    !metadataMismatch.reconciliation_reason?.includes(
      "Provider metadata mismatch",
    )
  ) {
    throw Object.assign(
      new Error("provider metadata mismatch was not quarantined"),
      { details: metadataMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-metadata-mismatch-quarantined",
      "passed",
      metadataMismatch,
    ),
  );

  providerOverrides.delete(WEBHOOK_FIXTURE.invalid.mollieId);
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const collectionMismatch = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (!collectionMismatch.reconciliation_reason?.includes("Collection items")) {
    throw Object.assign(
      new Error("collection total mismatch was not quarantined"),
      { details: collectionMismatch },
    );
  }
  checks.push(
    result(
      "server-action-api-collection-mismatch-no-partial-settlement",
      "passed",
      collectionMismatch,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, {
    status: "canceled",
  });
  const canceled = await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  assertStatus(
    checks,
    "server-action-api-provider-terminal-canceled",
    canceled.status,
    200,
  );
  const canceledState = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    canceledState.payment_status !== "canceled" ||
    canceledState.batch_status !== "canceled" ||
    canceledState.allocation_count !== 0
  ) {
    throw Object.assign(
      new Error("Canceled provider state was not applied atomically."),
      { details: canceledState },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-canceled-terminal-applied",
      "passed",
      canceledState,
    ),
  );

  providerOverrides.set(WEBHOOK_FIXTURE.invalid.mollieId, { status: "open" });
  await webhookRequest(WEBHOOK_FIXTURE.invalid.mollieId);
  const canceledReplay = await webhookState(WEBHOOK_FIXTURE.invalid);
  if (
    canceledReplay.payment_status !== "canceled" ||
    canceledReplay.batch_status !== "canceled"
  ) {
    throw Object.assign(
      new Error(
        "A terminal canceled payment was reopened by a delayed callback.",
      ),
      { details: canceledReplay },
    );
  }
  checks.push(
    result(
      "server-action-api-provider-terminal-cannot-reopen",
      "passed",
      canceledReplay,
    ),
  );
  providerOverrides.delete(WEBHOOK_FIXTURE.invalid.mollieId);

  const reconciliationAuditCount = await paymentAuditCount(
    WEBHOOK_FIXTURE.invalid.payment,
    "payment_reconciliation_required",
  );
  if (reconciliationAuditCount < 7) {
    throw Object.assign(
      new Error(
        "Provider mismatches did not produce durable redacted reconciliation audits.",
      ),
      {
        details: { reconciliationAuditCount },
      },
    );
  }
  checks.push(
    result("server-action-api-provider-mismatches-durably-audited", "passed", {
      reconciliationAuditCount,
    }),
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
    checks.push(
      result(
        "server-action-api-missing-webhook-secret-startup-fails-closed",
        "passed",
        await verifyMissingWebhookSecretFailsStartup(),
      ),
    );
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
