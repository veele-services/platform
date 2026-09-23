import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const RELEASE_WORKFLOWS = new Map([
  [".github/workflows/database-autofix.yml", 1],
  [".github/workflows/database-baseline.yml", 1],
  [".github/workflows/database-inspect.yml", 2],
  [".github/workflows/deploy.yml", 4],
  [".github/workflows/environment-isolation-preflight.yml", 3],
  [".github/workflows/fieldgrid-deploy-health-gate.yml", 4],
  [".github/workflows/fieldgrid-disposable-staging-rebuild.yml", 2],
  [".github/workflows/fieldgrid-material-inventory-phase11.yml", 2],
  [".github/workflows/fieldgrid-material-inventory-phase12.yml", 2],
  [".github/workflows/fieldgrid-migration-smoke.yml", 3],
  [".github/workflows/fieldgrid-staging-document-storage-backfill.yml", 4],
  [".github/workflows/fieldgrid-staging-field-demo-domain-repair.yml", 4],
  [
    ".github/workflows/fieldgrid-staging-field-demo-owner-binding-repair.yml",
    4,
  ],
  [".github/workflows/fieldgrid-staging-field-demo-owner-repair.yml", 4],
  [".github/workflows/fieldgrid-w00-runtime-principal.yml", 4],
  [".github/workflows/main-exact-head-validation.yml", 28],
  [".github/workflows/phase2e-staging-preflight.yml", 2],
  [".github/workflows/promotion-guard.yml", 2],
  [".github/workflows/runtime-entrypoint-inventory.yml", 3],
  [".github/workflows/runtime-safety-harness.yml", 36],
  [".github/workflows/seed-staging-demo.yml", 1],
  [".github/workflows/website-staging-acceptance.yml", 2],
  [".github/workflows/website-staging-proof-state.yml", 3],
  [".github/workflows/website-staging-stack-deploy.yml", 2],
]);

const TRUSTED_LOCAL_WORKFLOWS = new Map([
  [
    ".github/workflows/fieldgrid-disposable-staging-rebuild.yml",
    ["./.github/workflows/deploy.yml"],
  ],
]);

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
  for (const [path, expectedExternalActions] of RELEASE_WORKFLOWS) {
    const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
    const usesLines = source
      .split("\n")
      .filter((line) => /^\s*-?\s*uses:/u.test(line));
    const externalReferences = [
      ...source.matchAll(
        /^\s*-?\s*uses:\s+((?!\.\/)[^\s#@]+)@([^\s#]+)(?:\s+#\s*(\S+))?/gmu,
      ),
    ];
    const localReferences = [
      ...source.matchAll(/^\s*-?\s*uses:\s+(\.\/[^\s#]+)\s*$/gmu),
    ].map((match) => match[1]);
    assert.equal(
      externalReferences.length,
      expectedExternalActions,
      `${path} external action inventory changed`,
    );
    assert.equal(
      externalReferences.length + localReferences.length,
      usesLines.length,
      `${path} contains an unpinned or unparsable action reference`,
    );
    assert.deepEqual(
      localReferences,
      TRUSTED_LOCAL_WORKFLOWS.get(path) ?? [],
      `${path} local reusable-workflow inventory changed`,
    );

    for (const [, action, revision, version] of externalReferences) {
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
});
