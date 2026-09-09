import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_PROOF_HOST,
  FIELD_DEMO_FIXTURE_MARKER,
  FIELD_DEMO_FIXTURE_VERSION,
  FIELD_DEMO_HOST,
  FIELD_DEMO_SLUG,
  MANAGED_PROOF_HOST,
  MANAGED_PROOF_URL,
  MANAGED_PROOF_SLUG,
  WEBSITE_STAGING_PROOF_MARKER,
  decideFieldDemoFixture,
  fieldDemoProvisioningRunIsExact,
  fieldDemoProvisioningRunOwnershipIsExact,
  managedProofCandidateErrorCode,
  managedProofDomainBindingRequired,
  safeErrorCode,
  selectAutomationActor,
  selectDefaultAutomationActor,
  validateWebsiteStagingProofStateConfig,
} from "../../scripts/fieldgrid-website-staging-proof-state.mts";

const sha = "a".repeat(40);
const actor = "10000000-0000-4000-8000-000000000001";
const UUID_PATTERN_FOR_TEST =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;

const fieldDemoTenantId = "10000000-0000-4000-8000-000000000040";
const fieldDemoRunId = "10000000-0000-4000-8000-000000000041";
const exactFieldDemoPresence = {
  slug_match_count: 1,
  domain_match_count: 1,
};
const exactFieldDemoCandidate = {
  tenant_id: fieldDemoTenantId,
  slug: FIELD_DEMO_SLUG,
  plan_key: "enterprise",
  is_active: true,
  tenant_status: "trial",
  primary_domain_count: 1,
  primary_domain: FIELD_DEMO_HOST,
  primary_domain_type: "fieldgrid_subdomain",
  primary_domain_verification_status: "verified",
  primary_domain_disabled_count: 0,
  exact_domain_count: 1,
  organization_settings_count: 1,
};

function options(
  mode: "prepare-managed" | "complete-custom" | "verify" | "rollback-custom",
) {
  return {
    mode,
    expectedSha: sha,
    changeReference: "PR-449",
    evidenceDir: "/tmp/unused-proof-evidence",
  } as const;
}

test("managed proof retries an incomplete expected-domain binding and rejects collisions", () => {
  assert.equal(
    managedProofDomainBindingRequired({
      canonicalHostname: null,
      canonicalDomainStatus: null,
    }),
    true,
  );
  assert.equal(
    managedProofDomainBindingRequired({
      canonicalHostname: MANAGED_PROOF_HOST,
      canonicalDomainStatus: "pending",
    }),
    true,
  );
  assert.equal(
    managedProofDomainBindingRequired({
      canonicalHostname: MANAGED_PROOF_HOST,
      canonicalDomainStatus: "active",
    }),
    false,
  );
  assert.throws(
    () =>
      managedProofDomainBindingRequired({
        canonicalHostname: "different.staging.fieldgrid.nl",
        canonicalDomainStatus: "active",
      }),
    /different domain/u,
  );
});

test("field-demo is provisioned only after exact slug and domain absence", () => {
  assert.deepEqual(
    decideFieldDemoFixture({ slug_match_count: 0, domain_match_count: 0 }, []),
    { action: "provision" },
  );
  assert.deepEqual(
    decideFieldDemoFixture(exactFieldDemoPresence, [exactFieldDemoCandidate]),
    { action: "use-existing" },
  );
  assert.deepEqual(
    decideFieldDemoFixture({ slug_match_count: 1, domain_match_count: 1 }, []),
    { action: "reject", errorCode: "field_demo_binding_invalid" },
  );
});

test("field-demo rejects collisions, partial identities and invalid state", () => {
  const cases = [
    {
      presence: { slug_match_count: 0, domain_match_count: 1 },
      candidates: [{ ...exactFieldDemoCandidate, slug: "occupied" }],
      errorCode: "field_demo_identity_collision",
    },
    {
      presence: { slug_match_count: 1, domain_match_count: 0 },
      candidates: [
        {
          ...exactFieldDemoCandidate,
          primary_domain: "other.staging.fieldgrid.nl",
          exact_domain_count: 0,
        },
      ],
      errorCode: "field_demo_primary_domain_mismatch",
    },
    {
      presence: exactFieldDemoPresence,
      candidates: [
        { ...exactFieldDemoCandidate, exact_domain_count: 0 },
        {
          ...exactFieldDemoCandidate,
          tenant_id: "10000000-0000-4000-8000-000000000042",
          slug: "occupied",
        },
      ],
      errorCode: "field_demo_identity_ambiguous",
    },
    {
      presence: exactFieldDemoPresence,
      candidates: [{ ...exactFieldDemoCandidate, primary_domain_count: 2 }],
      errorCode: "field_demo_identity_ambiguous",
    },
    {
      presence: exactFieldDemoPresence,
      candidates: [{ ...exactFieldDemoCandidate, plan_key: "starter" }],
      errorCode: "field_demo_plan_mismatch",
    },
    {
      presence: exactFieldDemoPresence,
      candidates: [
        { ...exactFieldDemoCandidate, organization_settings_count: 0 },
      ],
      errorCode: "field_demo_settings_invalid",
    },
  ] as const;
  for (const fixture of cases) {
    assert.deepEqual(
      decideFieldDemoFixture(fixture.presence, fixture.candidates),
      { action: "reject", errorCode: fixture.errorCode },
    );
  }

  for (const candidate of [
    { ...exactFieldDemoCandidate, is_active: false },
    { ...exactFieldDemoCandidate, tenant_status: "suspended" },
    { ...exactFieldDemoCandidate, primary_domain_type: "custom_domain" },
    {
      ...exactFieldDemoCandidate,
      primary_domain_verification_status: "pending",
    },
    { ...exactFieldDemoCandidate, primary_domain_disabled_count: 1 },
  ]) {
    assert.deepEqual(
      decideFieldDemoFixture(exactFieldDemoPresence, [candidate]),
      { action: "reject", errorCode: "field_demo_runtime_state_invalid" },
    );
  }
});

test("field-demo post-provision evidence binds exact metadata and ownership", () => {
  const expected = {
    tenantId: fieldDemoTenantId,
    runId: fieldDemoRunId,
    requestedBy: actor,
    expectedSha: sha,
    changeReference: "PR-449",
  };
  const exact = {
    run_id: fieldDemoRunId,
    tenant_id: fieldDemoTenantId,
    status: "succeeded",
    marker: FIELD_DEMO_FIXTURE_MARKER,
    automation_contract: FIELD_DEMO_FIXTURE_VERSION,
    environment: "staging",
    staging_only: "true",
    expected_sha: sha,
    change_reference: "PR-449",
    slug: FIELD_DEMO_SLUG,
    plan_key: "enterprise",
    primary_domain: FIELD_DEMO_HOST,
    owner_email: null,
    requested_by: actor,
    tenant_created_by: actor,
  };
  assert.equal(fieldDemoProvisioningRunIsExact(exact, expected), true);
  assert.equal(fieldDemoProvisioningRunOwnershipIsExact(exact, expected), true);
  for (const candidate of [
    { ...exact, marker: "operator-owned" },
    { ...exact, automation_contract: "v0" },
    { ...exact, environment: "production" },
    { ...exact, staging_only: "false" },
    { ...exact, expected_sha: "b".repeat(40) },
    { ...exact, change_reference: "PR-else" },
    { ...exact, slug: "other" },
    { ...exact, primary_domain: "other.staging.fieldgrid.nl" },
    { ...exact, plan_key: "starter" },
    { ...exact, owner_email: "operator@example.invalid" },
    {
      ...exact,
      requested_by: "10000000-0000-4000-8000-000000000099",
    },
  ]) {
    assert.equal(fieldDemoProvisioningRunIsExact(candidate, expected), false);
  }
});

function baseEnvironment() {
  return {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    DATABASE_URL: "postgresql://staging.invalid/fieldgrid",
    FIELDGRID_MIGRATION_DATABASE_URL:
      "postgresql://migration.staging.invalid/fieldgrid",
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    WEBSITE_MANAGED_ACCEPTANCE_URL: MANAGED_PROOF_URL,
    WEBSITE_CUSTOM_ACCEPTANCE_URL: `https://${CUSTOM_PROOF_HOST}/`,
    FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: actor,
    FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION:
      "website-staging-prepare-managed",
  };
}

test("prepare-managed is exact-main, explicit and independent of custom routing", () => {
  assert.equal(MANAGED_PROOF_HOST, "managed-proof-w00-v2.staging.fieldgrid.nl");
  assert.deepEqual(
    validateWebsiteStagingProofStateConfig(
      options("prepare-managed"),
      baseEnvironment(),
    ),
    [],
  );

  const missingActor = {
    ...baseEnvironment(),
    FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: undefined,
  };
  assert.deepEqual(
    validateWebsiteStagingProofStateConfig(
      options("prepare-managed"),
      missingActor,
    ),
    [],
  );

  assert.match(
    validateWebsiteStagingProofStateConfig(options("prepare-managed"), {
      ...baseEnvironment(),
      GITHUB_REF_NAME: "staging",
    }).join(";"),
    /must run from main/u,
  );
  assert.match(
    validateWebsiteStagingProofStateConfig(options("prepare-managed"), {
      ...baseEnvironment(),
      FIELDGRID_DATABASE_CONNECTION_PURPOSE: undefined,
    }).join(";"),
    /migration connection purpose/u,
  );
});

test("managed proof candidates require one exact automation-owned identity", () => {
  const owned = {
    tenant_id: "10000000-0000-4000-8000-000000000030",
    slug: MANAGED_PROOF_SLUG,
    plan_key: "enterprise",
    domain: MANAGED_PROOF_HOST,
    marker: WEBSITE_STAGING_PROOF_MARKER,
    environment: "staging",
    provisioned_slug: MANAGED_PROOF_SLUG,
    provisioned_plan_key: "enterprise",
    provisioned_primary_domain: MANAGED_PROOF_HOST,
    provisioned_owner_email: null,
    provisioned_requested_by: actor,
    tenant_created_by: actor,
  };

  assert.equal(managedProofCandidateErrorCode([]), null);
  assert.equal(managedProofCandidateErrorCode([owned]), null);
  assert.equal(
    managedProofCandidateErrorCode([owned, { ...owned }]),
    "managed_proof_identity_ambiguous",
  );
  assert.equal(
    managedProofCandidateErrorCode([{ ...owned, slug: "occupied" }]),
    "managed_proof_identity_mismatch",
  );
  assert.equal(
    managedProofCandidateErrorCode([{ ...owned, plan_key: "starter" }]),
    "managed_proof_plan_mismatch",
  );
  assert.equal(
    managedProofCandidateErrorCode([{ ...owned, marker: null }]),
    "managed_proof_ownership_mismatch",
  );
  assert.equal(
    managedProofCandidateErrorCode([{ ...owned, domain: null }]),
    "managed_proof_identity_mismatch",
  );
  for (const candidate of [
    { ...owned, environment: "production" },
    { ...owned, provisioned_slug: "other" },
    { ...owned, provisioned_plan_key: "starter" },
    { ...owned, provisioned_primary_domain: "other.staging.fieldgrid.nl" },
    { ...owned, provisioned_owner_email: "operator@example.invalid" },
    { ...owned, provisioned_requested_by: null },
    {
      ...owned,
      provisioned_requested_by: "10000000-0000-4000-8000-000000000099",
    },
  ]) {
    assert.equal(
      managedProofCandidateErrorCode([candidate]),
      "managed_proof_ownership_mismatch",
    );
  }
});

test("proof evidence does not trust arbitrary external error codes", () => {
  const error = Object.assign(new Error("opaque failure"), {
    code: "credential-shaped-token",
  });
  assert.equal(safeErrorCode(error), "proof_state_failed");
});

test("actorless prepare prefers one admin and only falls back to one owner", () => {
  const owner = "10000000-0000-4000-8000-000000000010";
  const ownerTwo = "10000000-0000-4000-8000-000000000011";
  const admin = "10000000-0000-4000-8000-000000000020";
  const adminTwo = "10000000-0000-4000-8000-000000000021";

  assert.equal(
    selectDefaultAutomationActor([
      { user_id: admin, role: "admin" },
      { user_id: owner, role: "owner" },
      { user_id: ownerTwo, role: "owner" },
    ]),
    admin,
  );
  assert.equal(
    selectDefaultAutomationActor([{ user_id: owner, role: "owner" }]),
    owner,
  );
  assert.throws(
    () =>
      selectDefaultAutomationActor([
        { user_id: admin, role: "admin" },
        { user_id: adminTwo, role: "admin" },
        { user_id: owner, role: "owner" },
      ]),
    /exactly one active platform admin/u,
  );
  assert.throws(
    () =>
      selectDefaultAutomationActor([
        { user_id: owner, role: "owner" },
        { user_id: ownerTwo, role: "owner" },
      ]),
    /exactly one active platform owner/u,
  );
  assert.throws(
    () => selectDefaultAutomationActor([]),
    (error: unknown) => {
      assert.match(String(error), /exactly one active platform owner/u);
      assert.doesNotMatch(String(error), UUID_PATTERN_FOR_TEST);
      return true;
    },
  );
  assert.throws(
    () =>
      selectDefaultAutomationActor([
        { user_id: "should-not-be-selected", role: "support" },
      ]),
    /exactly one active platform owner/u,
  );
});

test("a configured active owner or admin remains the exact actor", () => {
  assert.equal(
    selectAutomationActor([{ user_id: actor, role: "owner" }], actor),
    actor,
  );
  assert.throws(
    () =>
      selectAutomationActor(
        [
          {
            user_id: "10000000-0000-4000-8000-000000000099",
            role: "admin",
          },
        ],
        actor,
      ),
    /not an active platform owner\/admin/u,
  );
});

test("complete-custom requires an unambiguous route for the exact staging SHA", () => {
  const exactRoute = {
    providerKey: "fieldgrid_vps",
    routeKey: "veele_marketing_primary",
    releaseId: `git-commit:${sha}`,
    expectedHosts: [CUSTOM_PROOF_HOST],
    healthPath: "/api/health",
    status: "routable",
    upstreamOrigin: "https://marketing.staging.fieldgrid.nl",
  };
  const environment = {
    ...baseEnvironment(),
    GITHUB_REF_NAME: "staging",
    FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION:
      "website-staging-complete-custom",
    FIELDGRID_MIGRATION_DATABASE_URL: undefined,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: undefined,
    FIELDGRID_CUSTOM_ROUTE_KEY: exactRoute.routeKey,
    FIELDGRID_CUSTOM_EXPECTED_HOST: CUSTOM_PROOF_HOST,
    FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON: JSON.stringify([exactRoute]),
  };

  assert.deepEqual(
    validateWebsiteStagingProofStateConfig(
      options("complete-custom"),
      environment,
    ),
    [],
  );
  assert.match(
    validateWebsiteStagingProofStateConfig(options("complete-custom"), {
      ...environment,
      FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: undefined,
    }).join(";"),
    /automation actor is required/u,
  );
  assert.match(
    validateWebsiteStagingProofStateConfig(options("complete-custom"), {
      ...environment,
      FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    }).join(";"),
    /runtime connection purpose/u,
  );
  assert.match(
    validateWebsiteStagingProofStateConfig(options("complete-custom"), {
      ...environment,
      FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON: JSON.stringify([
        exactRoute,
        exactRoute,
      ]),
    }).join(";"),
    /missing or ambiguous/u,
  );
  assert.match(
    validateWebsiteStagingProofStateConfig(options("complete-custom"), {
      ...environment,
      GITHUB_SHA: "b".repeat(40),
    }).join(";"),
    /checkout SHA differs/u,
  );
});
