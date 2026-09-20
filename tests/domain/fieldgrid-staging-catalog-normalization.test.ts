import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withHostedAuthVariants } from "../../scripts/fieldgrid-hosted-policy-variants.mts";
import { validateRepairVariants } from "../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts";
import { loadHostedPolicyCompatibilitySource } from "../../scripts/fieldgrid-hosted-policy-compatibility.mts";
import { safeNormalizationError } from "../../scripts/fieldgrid-staging-catalog-normalization.mts";
import { HOSTED_POLICY_REPLACEMENT, HOSTED_POLICY_SUPERSEDED, isVerifiedHostedPolicyBaseline } from "../../lib/db/src/hosted-policy-compatibility-identity.ts";

test("hosted provider variants remove only the redundant direct postgres auth grants", () => {
  const sql = readFileSync(new URL("../../lib/db/migrations/20260919220633_repair_tenant_management_policy_consumers.sql", import.meta.url), "utf8");
  const original = validateRepairVariants(JSON.parse(sql.split("$policy_repair_manifest$")[1]!));
  const before = structuredClone(original);
  const variants = withHostedAuthVariants(original);
  assert.deepEqual(original, before);
  assert.equal(variants.length, original.length + 4);
  for (const hosted of variants.filter((v) => v.profile === "hostedProvider")) {
    const provider = original.find((v) => v.state === hosted.state && v.profile === "providerSource")!;
    const normalized = structuredClone(hosted);
    normalized.profile = "providerSource";
    for (const [index, helper] of normalized.manifest.helpers.entries()) {
      if (helper.schema === "auth") helper.directAcl = provider.manifest.helpers[index]!.directAcl;
    }
    assert.deepEqual(normalized, provider);
  }
  const invalid = structuredClone(original);
  invalid.find((v) => v.profile === "providerSource")!.manifest.helpers.find((h) => h.schema === "auth")!
    .directAcl.find((a) => a.grantee === "postgres")!.grantable = true;
  assert.throws(() => withHostedAuthVariants(invalid), /hosted_policy_source_invalid/u);
});

test("compatibility baseline requires exact applied replacement hash and unique evidence", () => {
  const superseded = { ...HOSTED_POLICY_SUPERSEDED, baselined: true };
  const replacement = { ...HOSTED_POLICY_REPLACEMENT, baselined: false };
  assert.equal(isVerifiedHostedPolicyBaseline(superseded, [superseded, replacement]), true);
  for (const records of [[], [{ ...replacement, baselined: true }], [{ ...replacement, hash: "0".repeat(64) }],
    [replacement, replacement]]) assert.equal(isVerifiedHostedPolicyBaseline(superseded, records), false);
  assert.equal(isVerifiedHostedPolicyBaseline({ ...superseded, hash: "0".repeat(64) }, [replacement]), false);
  assert.equal(loadHostedPolicyCompatibilitySource().hash, replacement.hash);
});

test("normalization errors never expose database payloads", () => {
  assert.equal(safeNormalizationError(new Error("postgres://private-secret@host")),
    "fieldgrid-staging-catalog-normalization-v1: hosted_policy_operation_failed");
  assert.equal(safeNormalizationError(new Error("hosted_policy_catalog_invalid")),
    "fieldgrid-staging-catalog-normalization-v1: hosted_policy_catalog_invalid");
});
