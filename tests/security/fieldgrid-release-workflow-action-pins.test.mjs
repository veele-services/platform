import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const RELEASE_WORKFLOWS = [
  ".github/workflows/database-autofix.yml",
  ".github/workflows/database-baseline.yml",
  ".github/workflows/database-inspect.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/environment-isolation-preflight.yml",
  ".github/workflows/fieldgrid-deploy-health-gate.yml",
  ".github/workflows/fieldgrid-material-inventory-phase11.yml",
  ".github/workflows/fieldgrid-material-inventory-phase12.yml",
  ".github/workflows/fieldgrid-migration-smoke.yml",
  ".github/workflows/fieldgrid-staging-field-demo-domain-repair.yml",
  ".github/workflows/fieldgrid-staging-field-demo-owner-binding-repair.yml",
  ".github/workflows/fieldgrid-staging-field-demo-owner-repair.yml",
  ".github/workflows/fieldgrid-w00-runtime-principal.yml",
  ".github/workflows/main-exact-head-validation.yml",
  ".github/workflows/phase2e-staging-preflight.yml",
  ".github/workflows/promotion-guard.yml",
  ".github/workflows/runtime-entrypoint-inventory.yml",
  ".github/workflows/runtime-safety-harness.yml",
  ".github/workflows/seed-staging-demo.yml",
  ".github/workflows/website-staging-acceptance.yml",
  ".github/workflows/website-staging-proof-state.yml",
  ".github/workflows/website-staging-stack-deploy.yml",
];

const TRUSTED_ACTIONS = new Map([
  [
    "actions/attest-build-provenance",
    {
      revision: "e8998f949152b193b063cb0ec769d69d929409be",
      version: "v2.4.0",
    },
  ],
  [
    "actions/checkout",
    {
      revision: "11d5960a326750d5838078e36cf38b85af677262",
      version: "v4.4.0",
    },
  ],
  [
    "actions/download-artifact",
    {
      revision: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
      version: "v4.3.0",
    },
  ],
  [
    "actions/setup-node",
    {
      revision: "49933ea5288caeca8642d1e84afbd3f7d6820020",
      version: "v4.4.0",
    },
  ],
  [
    "actions/upload-artifact",
    {
      revision: "ea165f8d65b6e75b540449e92b4886f43607fa02",
      version: "v4.6.2",
    },
  ],
  [
    "pnpm/action-setup",
    {
      revision: "b906affcce14559ad1aafd4ab0e942779e9f58b1",
      version: "v4.3.0",
    },
  ],
]);

test("every release-critical action has an exact reviewed SHA and provenance label", () => {
  let actionCount = 0;

  for (const path of RELEASE_WORKFLOWS) {
    const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
    const usesLines = source
      .split("\n")
      .filter((line) => /^\s*-?\s*uses:/u.test(line));
    const references = [
      ...source.matchAll(
        /^\s*-?\s*uses:\s+([^\s#]+)@([^\s#]+)(?:\s+#\s*(\S+))?/gmu,
      ),
    ];
    assert.ok(references.length > 0, `${path} has no action references`);
    assert.equal(
      references.length,
      usesLines.length,
      `${path} contains an unpinned or unparsable action reference`,
    );

    for (const [, action, revision, version] of references) {
      actionCount += 1;
      const trusted = TRUSTED_ACTIONS.get(action);
      assert.ok(trusted, `${path}: ${action} has no reviewed provenance`);
      assert.equal(
        revision,
        trusted.revision,
        `${path}: ${action}@${revision} is not the reviewed revision`,
      );
      assert.equal(
        version,
        trusted.version,
        `${path}: ${action}@${revision} has an incorrect provenance label`,
      );
    }
  }

  assert.equal(actionCount, 116);
});
