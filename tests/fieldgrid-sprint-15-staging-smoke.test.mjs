import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertExpectedStagingSha,
  buildSprint15StagingSmokePlan,
  resolveStagingReleaseIdentity,
  runReadOnlySnapshot,
  validateSprint15StagingSmokePlan,
} from "../scripts/fieldgrid-sprint15-staging-smoke.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

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
      "FIELDGRID_STAGING_SMOKE_EXPECTED_SHA",
      "--expected-staging",
      "CANONICAL_STAGING_RELEASE_SHA_MARKER",
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
  const automationAuth = read(
    "artifacts/backoffice/src/lib/auth/staging-smoke-automation.ts",
  );
  const middleware = read("artifacts/backoffice/src/middleware.ts");

  assertContains(
    route,
    [
      "requirePlatformAdminFromRequest(request)",
      "requireStagingSmokeAccess(request)",
      "classifyStagingSmokeAutomationBearer(request)",
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
      ".fieldgrid-release-sha",
      "readDeployedReleaseSha",
    ],
    "platform smoke dashboard builder",
  );
  assertContains(
    automationAuth,
    ["timingSafeEqual", "ADMIN_API_SECRET", "Bearer ([^\\s,]+)"],
    "staging smoke automation auth",
  );
  assertContains(
    middleware,
    [
      "isStagingSmokeAutomationRequest(request.method, normalizedPathname)",
      "No other protected route bypasses middleware",
    ],
    "staging smoke middleware exception",
  );
});

test("sprint 15 live snapshot requires an exact expected staging SHA", () => {
  assert.equal(assertExpectedStagingSha("a".repeat(40)), "a".repeat(40));
  for (const invalid of ["", "A".repeat(40), "a".repeat(39), "main"]) {
    assert.throws(() => assertExpectedStagingSha(invalid), /expected-staging/u);
  }
});

test("sprint 15 release identity supports only the fixed marker bootstrap and exact agreement", async () => {
  const expected = "b".repeat(40);
  const bootstrap = await resolveStagingReleaseIdentity(
    { environment: {} },
    expected,
    { readCanonicalMarker: async () => expected },
  );
  assert.equal(bootstrap.source, "canonical-marker-bootstrap");
  assert.equal(bootstrap.deployedStagingSha, expected);

  const agreed = await resolveStagingReleaseIdentity(
    { environment: { releaseSha: expected } },
    expected,
    { readCanonicalMarker: async () => expected },
  );
  assert.equal(agreed.source, "api-and-canonical-marker");

  await assert.rejects(
    resolveStagingReleaseIdentity(
      { environment: { releaseSha: expected } },
      expected,
      { readCanonicalMarker: async () => "c".repeat(40) },
    ),
    /disagree/u,
  );
  await assert.rejects(
    resolveStagingReleaseIdentity(
      { environment: { releaseSha: "malformed" } },
      expected,
      { readCanonicalMarker: async () => expected },
    ),
    /malformed/u,
  );
});

test("sprint 15 runner fails closed when live release identity does not match", async () => {
  const expected = "d".repeat(40);
  const output = new URL(
    `./tmp-staging-smoke-${process.pid}-${Date.now()}/`,
    import.meta.url,
  );
  try {
    const { report } = await runReadOnlySnapshot(
      {
        apiUrl: "https://staging.fieldgrid.nl/api/platform/staging-smoke",
        expectedStaging: expected,
        outDir: fileURLToPath(output),
        releaseIdentityDependencies: {
          readCanonicalMarker: async () => expected,
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              environment: { releaseSha: "e".repeat(40) },
              checks: [],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      },
      {},
    );
    assert.equal(report.status, "fail");
    assert.equal(report.releaseIdentity, null);
  } finally {
    rmSync(fileURLToPath(output), { recursive: true, force: true });
  }
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
