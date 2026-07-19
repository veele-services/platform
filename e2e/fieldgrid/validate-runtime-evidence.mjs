#!/usr/bin/env node
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright');
const logsDir = join(artifactDir, 'logs');

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required evidence file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function requireLog(name) {
  const path = join(logsDir, name);
  assert(existsSync(path), `Missing required log: ${name}`);
  assert(statSync(path).isFile(), `Required log is not a file: ${name}`);
}

function checkNamed(startup, name) {
  const check = startup.checks?.find((entry) => entry.name === name);
  assert(check, `Missing startup check: ${name}`, { checks: startup.checks?.map((entry) => entry.name) });
  assert(check.ok === true, `Startup check did not pass: ${name}`, check);
  return check;
}

const startup = readJson(join(artifactDir, 'startup-status.json'));
const preflight = readJson(join(artifactDir, 'preflight.json'));
const proof = readJson(join(artifactDir, 'data-path-proof.json'));
const fixtures = readJson(join(artifactDir, 'e2e-fixtures.json'));

assert(startup.ready === true, 'Startup evidence is not ready', startup);
for (const name of ['postgresql', 'postgrest', 'gateway', 'backoffice-login', 'personnel-login', 'customer-login']) {
  checkNamed(startup, name);
}

assert(preflight.ready === true, 'Authenticated preflight did not pass', preflight);
for (const name of ['tenant-a-admin-backoffice', 'tenant-a-personnel', 'tenant-a-customer', 'data-path-proof']) {
  checkNamed(preflight, name);
}

assert(proof.status === 'passed', 'Structured data-path proof did not pass', proof.failure ?? proof);
assert(proof.customerTenantAAllowedAssignmentCount === 1, 'Tenant A customer must read its assignment exactly once', proof);
assert(proof.customerTenantADeniedTenantBAssignmentCount === 0, 'Tenant A customer must not read Tenant B assignments', proof);
assert(proof.customerTenantBDeniedTenantAAssignmentCount === 0, 'Tenant B customer must not read Tenant A assignments', proof);
assert(proof.personnelTenantAAssignmentAllowed === true, 'Tenant A personnel must be assigned to the Tenant A assignment', proof);
assert(proof.personnelTenantATenantBAssignmentDenied === true, 'Tenant A personnel must not be assigned to the Tenant B assignment', proof);
assert(proof.personnelTenantBTenantAAssignmentDenied === true, 'Tenant B personnel must not be assigned to the Tenant A assignment', proof);
assert(proof.invalidJwtStatus >= 400, 'Invalid or expired JWT must be rejected', proof);
assert(proof.serviceRoleBrowserBypassDetected === false, 'Service-role browser bypass must be absent', proof);
assert(proof.jwtAlgorithm === 'HS256', 'JWT algorithm must be HS256', proof);
assert(proof.jwtRole === 'authenticated', 'JWT role must be authenticated', proof);
assert(proof.jwtSub === '20000000-0000-4000-8000-000000000105', 'JWT subject must be the Tenant A customer fixture user', proof);
assert(proof.jwtEmail === 'customer@tenant-a.runtime.fieldgrid.test', 'JWT e-mail must be the canonical Tenant A customer fixture e-mail', proof);
assert(proof.jwtMaximumLifetimeSeconds <= 900, 'JWT maximum lifetime must be at most 900 seconds', proof);
assert(proof.postgrestVersion === 'postgrest/postgrest:v12.2.8', 'PostgREST version evidence mismatch', proof);

assert(fixtures.status === 'passed', 'E2E fixtures did not pass verification', fixtures);
assert(fixtures.assignmentPersonnelLinkCount > 0, 'Assignment-personnel link fixture is missing', fixtures);
assert(fixtures.inactivePersonnelCount === 1, 'Inactive personnel fixture count mismatch', fixtures);
assert(fixtures.reportCount === 1, 'Approved report fixture count mismatch', fixtures);
assert(fixtures.invoiceCount === 1, 'Invoice fixture count mismatch', fixtures);
assert(fixtures.customerUserCount > 0, 'Customer-user fixture count mismatch', fixtures);
assert(fixtures.customerUserByUserCount === 1, 'Customer-user/user fixture count mismatch', fixtures);
assert(fixtures.canonicalAdminRoleCountTenantA === 1, 'Tenant A canonical Admin role count mismatch', fixtures);
assert(fixtures.canonicalAdminRoleCountTenantB === 1, 'Tenant B canonical Admin role count mismatch', fixtures);
assert(Number.isSafeInteger(fixtures.canonicalAdminPermissionExpectedCount) && fixtures.canonicalAdminPermissionExpectedCount > 0, 'Canonical Admin permission contract count is missing', fixtures);
assert(fixtures.canonicalAdminPermissionCountTenantA === fixtures.canonicalAdminPermissionExpectedCount, 'Tenant A canonical Admin permission count mismatch', fixtures);
assert(fixtures.canonicalAdminPermissionCountTenantB === fixtures.canonicalAdminPermissionExpectedCount, 'Tenant B canonical Admin permission count mismatch', fixtures);
assert(fixtures.tenantAAdminAllRoleLinkCount === 1, 'Tenant A admin must have only its canonical role', fixtures);
assert(fixtures.tenantBAdminAllRoleLinkCount === 1, 'Tenant B admin must have only its canonical role', fixtures);
assert(fixtures.crossTenantRoleLeakCount === 0, 'Canonical admin roles must not leak across tenants', fixtures);
assert(fixtures.crossTenantValidation?.tenantBAssignmentInTenantACount === 0, 'Cross-tenant fixture validation failed', fixtures);

const requiredLogs = [
  'backoffice.stdout.log',
  'backoffice.stderr.log',
  'personnel.stdout.log',
  'personnel.stderr.log',
  'customer.stdout.log',
  'customer.stderr.log',
  'orchestrator.stdout.log',
  'orchestrator.stderr.log',
];
if (process.env.CI) requiredLogs.push('postgrest.log');
for (const name of requiredLogs) {
  requireLog(name);
}

console.log('Fieldgrid Playwright runtime evidence passed');
