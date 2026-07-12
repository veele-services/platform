import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function readRepoFile(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function extractAllowedValues(sql, constraintName) {
  const constraintIndex = sql.lastIndexOf(`CONSTRAINT ${constraintName}`);
  assert.notEqual(constraintIndex, -1, `${constraintName} should exist in migration SQL`);
  const constraintSql = sql.slice(constraintIndex);
  const inMatch = constraintSql.match(/IN\s*\(([^)]+)\)/iu);
  assert.ok(inMatch, `${constraintName} should use an IN check constraint`);
  return new Set(
    [...inMatch[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]),
  );
}

function extractTenantDomainFixtureLiterals(source) {
  const valuesMatch = source.match(
    /values\s*\(\$1,\s*\$2,\s*'([^']+)',\s*true,\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/iu,
  );
  assert.ok(valuesMatch, "runtime fixture should insert explicit tenant_domains literals");
  const [, type, verificationStatus, verificationMethod, tlsStatus] = valuesMatch;
  return { type, verificationStatus, verificationMethod, tlsStatus };
}

function extractCustomerUserFixtureLiterals(source) {
  const valuesMatch = source.match(
    /customer@tenant-a\.runtime\.fieldgrid\.test',\s*'([^']+)',\s*'([^']+)'/iu,
  );
  assert.ok(valuesMatch, "runtime fixture should insert explicit customer_users literals");
  const [, role, status] = valuesMatch;
  return { role, status };
}

test("runtime tenant domain fixtures use schema-valid check constraint values", () => {
  const migration055 = readRepoFile("lib/db/migrations/055_tenant_domains.sql");
  const migration073 = readRepoFile("lib/db/migrations/073_platform_custom_domains.sql");
  const fixtureSource = readRepoFile("scripts/fieldgrid-runtime-safety-fixtures.mjs");
  const fixture = extractTenantDomainFixtureLiterals(fixtureSource);

  const typeValues = extractAllowedValues(migration055, "tenant_domains_type_check");
  const verificationStatusValues = extractAllowedValues(migration055, "tenant_domains_verification_status_check");
  const verificationMethodValues = extractAllowedValues(migration073, "tenant_domains_verification_method_check");
  const tlsStatusValues = extractAllowedValues(migration073, "tenant_domains_tls_status_check");

  assert.ok(typeValues.has(fixture.type), `tenant_domains.type fixture value is invalid: ${fixture.type}`);
  assert.ok(
    verificationStatusValues.has(fixture.verificationStatus),
    `tenant_domains.verification_status fixture value is invalid: ${fixture.verificationStatus}`,
  );
  assert.ok(
    verificationMethodValues.has(fixture.verificationMethod),
    `tenant_domains.verification_method fixture value is invalid: ${fixture.verificationMethod}`,
  );
  assert.ok(tlsStatusValues.has(fixture.tlsStatus), `tenant_domains.tls_status fixture value is invalid: ${fixture.tlsStatus}`);
});

test("runtime customer user fixtures use schema-valid check constraint values", () => {
  const migration037 = readRepoFile("lib/db/migrations/037_tenant_customer_users_events_hardening.sql");
  const fixtureSource = readRepoFile("scripts/fieldgrid-runtime-safety-fixtures.mjs");
  const fixture = extractCustomerUserFixtureLiterals(fixtureSource);

  const roleValues = extractAllowedValues(migration037, "customer_users_role_check");
  const statusValues = extractAllowedValues(migration037, "customer_users_status_check");

  assert.ok(roleValues.has(fixture.role), `customer_users.role fixture value is invalid: ${fixture.role}`);
  assert.ok(statusValues.has(fixture.status), `customer_users.status fixture value is invalid: ${fixture.status}`);
});
