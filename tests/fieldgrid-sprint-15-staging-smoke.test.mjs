import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildSprint15StagingSmokePlan,
  DEFAULT_STAGING_SMOKE_API_URL,
  main,
  parseArgs,
  readCanonicalStagingRelease,
  runReadOnlySnapshot,
  validateSprint15StagingSmokePlan,
} from "../scripts/fieldgrid-sprint15-staging-smoke.mjs";
import { validateStagingSmokeEvidence } from "../scripts/fieldgrid-staging-promotion-gate.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

const activeSha = "a".repeat(40);
const canonicalRelease = {
  sha: activeSha,
  releasePath: `/var/www/veele/staging/releases/20260920000000-${activeSha.slice(0, 7)}`,
};
const authEnv = { FIELDGRID_STAGING_SMOKE_BEARER: "synthetic-test-bearer" };

function greenDashboard({ releaseSha = activeSha } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    environment: {
      stagingHost: "staging.fieldgrid.nl",
      pilotTenantSlug: "field-demo",
      releaseSha,
    },
    totals: { tenants: 1, activeTenants: 1 },
    checks: [
      "HOST",
      "LOGIN",
      "MODULES",
      "SECTORS",
      "STORAGE",
      "PDF-DOWNLOADS",
      "MIGRATIONS",
      "SUPPORT",
      "AUDIT",
    ].map((id) => ({ id: `FG-SMOKE-${id}`, status: "ok" })),
    minimumGreen: [
      "HOST",
      "LOGIN",
      "MODULES",
      "SECTORS",
      "STORAGE",
      "MIGRATIONS",
    ].map((id) => `FG-SMOKE-${id}`),
    runHistory: [],
    liveSmokes: [],
    migrationSmoke: { status: "ok" },
    mutatingChecks: [],
    stagingPromotionGate: { status: "warning" },
  };
}

function smokeFixture(t, overrides = {}) {
  const outDir = mkdtempSync(join(tmpdir(), "fieldgrid-exact-smoke-"));
  t.after(() => rmSync(outDir, { force: true, recursive: true }));
  return { ...parseArgs([]), expectedStaging: activeSha, outDir, ...overrides };
}

test("read-only smoke requires explicit full SHA and canonical authenticated endpoint before fetch", async (t) => {
  const parsed = parseArgs([
    "--run-read-only",
    "--expected-staging",
    activeSha,
    "--canonical-marker-bootstrap",
  ]);
  assert.equal(parsed.expectedStaging, activeSha);
  assert.equal(parsed.canonicalMarkerBootstrap, true);
  assert.throws(
    () => parseArgs(["--canonical-marker-bootstrap=false"]),
    /takes no value/u,
  );
  for (const overrides of [
    { expectedStaging: "" },
    { expectedStaging: "a".repeat(7) },
    { apiUrl: "https://other.example/api/platform/staging-smoke" },
    { apiUrl: `${DEFAULT_STAGING_SMOKE_API_URL}?redirect=other` },
  ]) {
    const options = smokeFixture(t, overrides);
    await assert.rejects(
      runReadOnlySnapshot(options, authEnv, {
        fetchImpl: () =>
          assert.fail("invalid request must not transmit credentials"),
      }),
      /requires/u,
    );
    assert.deepEqual(readdirSync(options.outDir), []);
  }
  await assert.rejects(
    runReadOnlySnapshot(
      smokeFixture(t),
      {},
      {
        fetchImpl: () =>
          assert.fail("missing credentials must not reach fetch"),
      },
    ),
    /credentials are required/u,
  );
});

test("exact API release smoke produces consumer-valid evidence without reading markers", async (t) => {
  const options = smokeFixture(t);
  options.outDir = join(options.outDir, "private-evidence");
  const { report, reportPath } = await runReadOnlySnapshot(options, authEnv, {
    fetchImpl: async (url, init) => {
      assert.equal(url, DEFAULT_STAGING_SMOKE_API_URL);
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.authorization, "Bearer synthetic-test-bearer");
      return Response.json(greenDashboard());
    },
    readCanonicalRelease: () =>
      assert.fail("marker bootstrap was not requested"),
  });
  assert.equal(report.status, "pass");
  assert.equal(report.releaseIdentity.source, "api");
  assert.deepEqual(
    validateStagingSmokeEvidence(report, { expectedStaging: activeSha }),
    [],
  );
  const artifact = readFileSync(reportPath, "utf8");
  assert.deepEqual(JSON.parse(artifact), report);
  assert.equal(
    artifact.includes(authEnv.FIELDGRID_STAGING_SMOKE_BEARER),
    false,
  );
  assert.equal(statSync(reportPath).mode & 0o777, 0o600);
  assert.equal(statSync(options.outDir).mode & 0o777, 0o700);
});

test("explicit legacy bootstrap verifies the same canonical marker before and after capture", async (t) => {
  for (const releaseSha of [null, activeSha]) {
    const events = [];
    const { report } = await runReadOnlySnapshot(
      smokeFixture(t, { canonicalMarkerBootstrap: true }),
      authEnv,
      {
        readCanonicalRelease: async () => {
          events.push("marker");
          return canonicalRelease;
        },
        fetchImpl: async () => {
          events.push("fetch");
          return Response.json(greenDashboard({ releaseSha }));
        },
      },
    );
    assert.deepEqual(events, ["marker", "fetch", "marker"]);
    assert.equal(
      report.releaseIdentity.source,
      releaseSha ? "api-and-canonical-marker" : "canonical-marker-bootstrap",
    );
    assert.equal(report.releaseIdentity.canonicalMarkerSha, activeSha);
    assert.deepEqual(
      validateStagingSmokeEvidence(report, { expectedStaging: activeSha }),
      [],
    );
  }
});

test("missing, changed or mismatching identities fail without an artifact or fallback", async (t) => {
  for (const [label, releaseSha, markers, canonicalMarkerBootstrap] of [
    ["missing API proof", null, [], false],
    [
      "wrong API proof",
      "b".repeat(40),
      [canonicalRelease, canonicalRelease],
      true,
    ],
    [
      "invalid API proof",
      "invalid",
      [canonicalRelease, canonicalRelease],
      true,
    ],
    [
      "wrong initial marker",
      null,
      [{ ...canonicalRelease, sha: "b".repeat(40) }],
      true,
    ],
    [
      "changed marker",
      null,
      [canonicalRelease, { ...canonicalRelease, sha: "b".repeat(40) }],
      true,
    ],
    [
      "changed current release",
      null,
      [
        canonicalRelease,
        {
          ...canonicalRelease,
          releasePath: canonicalRelease.releasePath.replace(
            "20260920000000",
            "20260920000001",
          ),
        },
      ],
      true,
    ],
  ]) {
    const options = smokeFixture(t, { canonicalMarkerBootstrap });
    let fetches = 0;
    await assert.rejects(
      runReadOnlySnapshot(options, authEnv, {
        readCanonicalRelease: async () => markers.shift(),
        fetchImpl: async () => {
          fetches += 1;
          return Response.json(greenDashboard({ releaseSha }));
        },
      }),
      /release|marker/u,
      label,
    );
    if (label === "wrong initial marker") assert.equal(fetches, 0);
    assert.deepEqual(readdirSync(options.outDir), [], label);
  }
});

test("HTTP 200 with failed required storage evidence fails capture and the real CLI exit code", async (t) => {
  const dashboard = greenDashboard();
  dashboard.checks.find((check) => check.id === "FG-SMOKE-STORAGE").status =
    "warning";
  const options = smokeFixture(t);
  const { report } = await runReadOnlySnapshot(options, authEnv, {
    fetchImpl: async () => Response.json(dashboard),
  });
  assert.equal(report.httpStatus, 200);
  assert.equal(report.status, "fail");
  assert.equal(report.summary.status, "fail");
  assert.ok(
    report.validationErrors.some((error) => error.includes("FG-SMOKE-STORAGE")),
  );
  t.mock.method(globalThis, "fetch", async () => Response.json(dashboard));
  t.mock.method(console, "log", () => {});
  const originalBearer = process.env.FIELDGRID_STAGING_SMOKE_BEARER;
  process.env.FIELDGRID_STAGING_SMOKE_BEARER =
    authEnv.FIELDGRID_STAGING_SMOKE_BEARER;
  try {
    assert.equal(
      await main([
        "--run-read-only",
        "--expected-staging",
        activeSha,
        "--out",
        options.outDir,
      ]),
      1,
    );
  } finally {
    if (originalBearer === undefined)
      delete process.env.FIELDGRID_STAGING_SMOKE_BEARER;
    else process.env.FIELDGRID_STAGING_SMOKE_BEARER = originalBearer;
  }
});

test("raw response and transport errors never enter smoke artifacts or exceptions", async (t) => {
  const sensitive = "PRIVATE_RESPONSE_CANARY";
  for (const response of [
    new Response(sensitive, { status: 401 }),
    new Response(`<html>${sensitive}</html>`, { status: 200 }),
    Response.json({ error: sensitive }),
  ]) {
    const { report, reportPath } = await runReadOnlySnapshot(
      smokeFixture(t, { canonicalMarkerBootstrap: true }),
      authEnv,
      {
        fetchImpl: async () => response,
        readCanonicalRelease: async () => canonicalRelease,
      },
    );
    assert.equal(report.status, "fail");
    assert.equal(report.dashboard, null);
    assert.equal(readFileSync(reportPath, "utf8").includes(sensitive), false);
  }
  for (const fetchImpl of [
    async () => {
      throw new Error(sensitive);
    },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error(sensitive));
          },
        }),
      ),
  ]) {
    await assert.rejects(
      runReadOnlySnapshot(smokeFixture(t), authEnv, { fetchImpl }),
      (error) => {
        assert.equal(error.message.includes(sensitive), false);
        assert.match(error.message, /Authenticated staging smoke/u);
        return true;
      },
    );
  }
});

test("oversize response streaming is cancelled at the bound without persisting any payload", async (t) => {
  const options = smokeFixture(t);
  let cancelled = false;
  let pulls = 0;
  await assert.rejects(
    runReadOnlySnapshot(options, authEnv, {
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls += 1;
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    }),
    /size limit/u,
  );
  assert.equal(cancelled, true);
  assert.ok(
    pulls <= 3,
    "body reader must stop without consuming the remaining stream",
  );
  assert.deepEqual(readdirSync(options.outDir), []);
});

test("canonical bootstrap rejects escaped releases, symlinked markers and marker drift", async () => {
  const currentPath = "/var/www/veele/staging/current";
  function filesystem(overrides = {}) {
    return {
      lstatImpl: async (path) => ({
        isFile: () => path !== currentPath,
        isSymbolicLink: () => path === currentPath,
        size: 41,
      }),
      realpathImpl: async (path) =>
        path === currentPath ? canonicalRelease.releasePath : path,
      readFileImpl: async () => `${activeSha}\n`,
      ...overrides,
    };
  }
  assert.deepEqual(
    await readCanonicalStagingRelease(filesystem()),
    canonicalRelease,
  );
  for (const overrides of [
    {
      realpathImpl: async (path) =>
        path === currentPath
          ? "/var/www/veele/production/releases/20260920000000-aaaaaaa"
          : path,
    },
    {
      lstatImpl: async () => ({
        isFile: () => false,
        isSymbolicLink: () => true,
        size: 41,
      }),
    },
    { readFileImpl: async () => `${"b".repeat(40)}\n` },
    { readFileImpl: async () => `${"a".repeat(7)}\n` },
    {
      readFileImpl: async () => {
        throw new Error("PRIVATE_PATH_CANARY");
      },
    },
  ]) {
    await assert.rejects(readCanonicalStagingRelease(filesystem(overrides)), {
      message: "Canonical staging release marker is unavailable or invalid.",
    });
  }
});

test("sprint 15 extends staging smoke data with run history and live smoke contracts", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");
  const types = read(
    "artifacts/backoffice/src/app/actions/platform-smoke.types.ts",
  );

  assertContains(
    `${action}\n${types}`,
    [
      "PlatformSmokeRunHistoryEntry",
      "PlatformLiveSmokeTarget",
      "PlatformMigrationSmokeStatus",
      "PlatformMutatingSmokeCheck",
      "readSmokeRunReports",
      "runHistory",
      "liveSmokes",
      "migrationSmoke",
      "mutatingChecks",
      "tenantRegionsTable",
      "FG-LIVE-HOST",
      "FG-LIVE-PERSONNEL-PLANNING",
      "FG-MUTATE-LIFECYCLE",
      "field-demo",
      "field-demo-only",
    ],
    "platform smoke action",
  );
});

test("sprint 15 staging smoke page renders run history, live smokes and cleanup", () => {
  const page = read(
    "artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx",
  );

  assertContains(
    page,
    [
      "Run history",
      "Live Playwright-smokes",
      "Migratie-smoke status",
      "Mutating checks en cleanup",
      "dashboard.runHistory",
      "dashboard.liveSmokes",
      "dashboard.migrationSmoke",
      "dashboard.mutatingChecks",
      "FG-OPS-008",
      "platform-smoke.types",
      "RunHistoryCard",
      "LiveSmokeCard",
      "MutatingCheckCard",
    ],
    "staging smoke page",
  );
});

test("sprint 15 script is plan-only by default and supports read-only snapshots", () => {
  const script = read("scripts/fieldgrid-sprint15-staging-smoke.mjs");
  const packageJson = read("package.json");

  assertContains(
    script,
    [
      "fieldgrid-sprint-15-staging-smoke",
      "FIELDGRID_STAGING_SMOKE_COOKIE",
      "FIELDGRID_STAGING_SMOKE_BEARER",
      "FIELDGRID_STAGING_PILOT_TENANT_SLUG",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM",
      "runReadOnlySnapshot",
      "artifacts/staging-smoke",
      "artifacts/migration-smoke",
      "liveSmokeTargets",
      "mutatingChecks",
      "cleanupSelectors",
      "Playwright",
      "destructive: false",
      "mutatesExistingTenants: false",
    ],
    "sprint 15 script",
  );
  assertContains(
    packageJson,
    [
      "fieldgrid:sprint15-staging-smoke",
      "fieldgrid:sprint15-staging-smoke:check",
      "fieldgrid:sprint15-staging-smoke:run-read-only",
    ],
    "package scripts",
  );
});

test("sprint 15 uses the environment-bound pilot host during staging acceptance", () => {
  const plan = buildSprint15StagingSmokePlan();
  const tenantTargets = plan.liveSmokeTargets.filter(
    (target) => target.id !== "FG-LIVE-HOST",
  );

  assert.equal(plan.pilotTenantSlug, "field-demo");
  assert.ok(tenantTargets.length > 0);
  assert.deepEqual(
    [...new Set(tenantTargets.map((target) => target.host))],
    ["field-demo.staging.fieldgrid.nl"],
  );
  assert.deepEqual(validateSprint15StagingSmokePlan(plan), []);
});

test("sprint 15 rejects invalid and alternate pilot tenant slugs", () => {
  const invalidPlan = buildSprint15StagingSmokePlan({
    FIELDGRID_STAGING_PILOT_TENANT_SLUG: "https://other.example",
  });
  const alternatePlan = buildSprint15StagingSmokePlan({
    FIELDGRID_STAGING_PILOT_TENANT_SLUG: "live-customer",
  });

  assert.match(
    validateSprint15StagingSmokePlan(invalidPlan).join("\n"),
    /geen geldige DNS-label/u,
  );
  assert.match(
    validateSprint15StagingSmokePlan(alternatePlan).join("\n"),
    /uitsluitend de vaste field-demo/u,
  );
});

test("sprint 15 rejects duplicate IDs and host or confirmation tampering", () => {
  const plan = buildSprint15StagingSmokePlan();
  plan.liveSmokeTargets[1].id = "FG-LIVE-HOST";
  plan.liveSmokeTargets[1].host = "other.fieldgrid.nl";
  plan.mutatingChecks[0].confirmVar =
    "FIELDGRID_MUTATING_SMOKE_CONFIRM=other-tenant";

  const errors = validateSprint15StagingSmokePlan(plan).join("\n");
  assert.match(errors, /target-ID's exact eenmaal/u);
  assert.match(errors, /vaste platform staging-host/u);
  assert.match(errors, /vaste pilottenantbevestiging/u);
});

test("sprint 15 JSON API uses route-handler platform auth", () => {
  const route = read(
    "artifacts/backoffice/src/app/api/platform/staging-smoke/route.ts",
  );
  const platformAuth = read("artifacts/backoffice/src/lib/auth/platform.ts");
  const supabaseServer = read(
    "artifacts/backoffice/src/lib/supabase/server.ts",
  );
  const platformSmoke = read(
    "artifacts/backoffice/src/app/actions/platform-smoke.ts",
  );

  assertContains(
    route,
    [
      "isRequestHostPlatformHost(request)",
      "requirePlatformAdminFromRequest(request)",
      "buildPlatformStagingSmokeDashboard",
      "Authenticatie vereist",
      "Cache-Control",
      "private, no-store",
    ],
    "staging smoke JSON route",
  );
  assertContains(
    platformAuth,
    [
      "createClientFromRequest(request)",
      "getCurrentPlatformUserFromRequest",
      "isRequestHostPlatformHost",
      "requirePlatformAdminFromRequest",
    ],
    "platform route-handler auth",
  );
  assertContains(
    supabaseServer,
    [
      "cookieHeaderToPairs",
      "createClientFromRequest",
      'request.headers.get("cookie")',
      "createSupabaseCookieOptions(host)",
    ],
    "route-handler Supabase client",
  );
  assertContains(
    platformSmoke,
    [
      "buildPlatformStagingSmokeDashboard",
      "getPlatformStagingSmokeDashboard",
      "return buildPlatformStagingSmokeDashboard()",
    ],
    "platform smoke dashboard builder",
  );
});

test("sprint 15 API server prefixes platform pass-through with the backoffice base path", () => {
  const apiRoutes = read("artifacts/api-server/src/routes/index.ts");
  const platformProxy = read(
    "artifacts/api-server/src/routes/platform-backoffice.ts",
  );
  const docs = read("docs/deployment/self-hosted-runner.md");

  assert.ok(
    apiRoutes.indexOf("router.use(platformBackofficeRouter)") <
      apiRoutes.indexOf("router.use(customersRouter)"),
    "platform API pass-through should run before tenant customer auth middleware",
  );
  assertContains(
    platformProxy,
    [
      'router.use("/platform"',
      "BACKOFFICE_INTERNAL_URL",
      "BACKOFFICE_PORT",
      "req.originalUrl",
      "`/admin${req.originalUrl}`",
      '"/admin/backoffice-api"',
      "x-forwarded-host",
      "fetch(upstreamUrl",
      "GET, HEAD",
    ],
    "API server platform pass-through",
  );
  assertContains(
    docs,
    ["@platform_api path /api /api/*", "reverse_proxy 127.0.0.1:3304"],
    "deployment routing docs",
  );
});

test("sprint 15 docs capture staging smoke dashboard delivery", () => {
  const sprint15 = read("docs/fieldgrid-sprint-15-staging-smoke.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const testMatrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    `${sprint15}\n${sprintPlan}\n${testMatrix}`,
    [
      "Sprint 15",
      "Staging smoke dashboard",
      "Run history",
      "Live Playwright-smokes",
      "Migratie-smoke status",
      "Mutating checks en cleanup",
      "FG-OPS-008",
      "runtime-proof-open",
      "geen migratie",
      "Supabase changelog",
    ],
    "sprint 15 canon",
  );
});
