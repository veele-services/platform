import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withHostedAuthVariants } from "../../scripts/fieldgrid-hosted-policy-variants.mts";
import { withPg17RestoredTargetVariants } from "../../scripts/fieldgrid-pg17-restored-policy-variants.mts";
import { validateRepairVariants, type RepairVariant } from "../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts";

const original = withHostedAuthVariants(JSON.parse(readFileSync(new URL(
  "../../lib/db/migrations/20260919220633_repair_tenant_management_policy_consumers.sql", import.meta.url),
"utf8").split("$policy_repair_manifest$")[1]!));
const invoice = (variant: RepairVariant) => variant.manifest.policies.find((policy) =>
  policy.schema === "public" && policy.table === "invoices" && policy.name === "invoices_customer_sent_select")!;

test("only six pinned completed targets gain the observed PG17 array-cast spelling", () => {
  const before = structuredClone(original);
  const variants = validateRepairVariants(withPg17RestoredTargetVariants(original));
  assert.deepEqual(original, before);
  assert.deepEqual(variants.slice(0, original.length), before);
  const added = variants.slice(original.length);
  assert.equal(added.length, 6);
  for (const variant of added) {
    assert.ok(["targetClean", "targetUpgrade"].includes(variant.state));
    const source = before.find((candidate) => candidate.state === variant.state &&
      `${candidate.profile}Restored` === variant.profile)!;
    assert.match(invoice(variant).usingExpression!, /ARRAY\[\('sent'::character varying\)::text/u);
    const reconstructed = structuredClone(variant);
    reconstructed.profile = source.profile;
    invoice(reconstructed).usingExpression = invoice(source).usingExpression;
    assert.deepEqual(reconstructed, source);
  }
});

for (const [name, mutate] of Object.entries({
  expression: (variant: RepairVariant) => { invoice(variant).usingExpression = "true"; },
  roles: (variant: RepairVariant) => { invoice(variant).roles = ["PUBLIC"]; },
  helper: (variant: RepairVariant) => { variant.manifest.helpers[0]!.securityDefiner = true; },
  relation: (variant: RepairVariant) => { variant.manifest.relations[0]!.rowSecurity = false; },
  profile: (variant: RepairVariant) => { variant.profile = "unreviewed"; },
})) {
  test(`unrecognized target ${name} cannot become a restored variant`, () => {
    const changed = structuredClone(original);
    mutate(changed.find((variant) => variant.state === "targetClean")!);
    assert.throws(() => withPg17RestoredTargetVariants(changed), /pg17_restored_policy_source_invalid/u);
  });
}

test("the immutable hosted replacement derives the same exact target variants", () => {
  const replacement = JSON.parse(readFileSync(new URL(
    "../../lib/db/migrations/20260920131458_reconcile_hosted_policy_contract.sql", import.meta.url),
  "utf8").split("$policy_repair_manifest$")[1]!);
  const hosted = replacement.filter((variant: RepairVariant) => variant.profile.startsWith("hosted"));
  const variants = validateRepairVariants(withPg17RestoredTargetVariants(hosted));
  assert.equal(variants.length, hosted.length + 2);
  assert.deepEqual(variants.slice(hosted.length), withPg17RestoredTargetVariants(original).filter((variant) =>
    variant.profile === "hostedProviderRestored"));
});
