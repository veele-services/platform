import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_PROOF_HOST,
  MANAGED_PROOF_HOST,
  MANAGED_PROOF_URL,
  validateWebsiteStagingProofStateConfig,
} from "../../scripts/fieldgrid-website-staging-proof-state.mts";

const sha = "a".repeat(40);
const actor = "10000000-0000-4000-8000-000000000001";

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

function baseEnvironment() {
  return {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    DATABASE_URL: "postgresql://staging.invalid/fieldgrid",
    WEBSITE_MANAGED_ACCEPTANCE_URL: MANAGED_PROOF_URL,
    WEBSITE_CUSTOM_ACCEPTANCE_URL: `https://${CUSTOM_PROOF_HOST}/`,
    FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: actor,
    FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION:
      "website-staging-prepare-managed",
  };
}

test("prepare-managed is exact-main, explicit and independent of custom routing", () => {
  assert.equal(MANAGED_PROOF_HOST, "managed-proof.staging.fieldgrid.nl");
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
