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
const proof = readJson(join(artifactDir, 'data-path-proof.json'));
const fixtures = readJson(join(artifactDir, 'e2e-fixtures.json'));
const preflight = readJson(join(artifactDir, 'preflight.json'));

assert(startup.ready === true, 'Startup evidence is not ready', startup);
for (const name of ['postgresql', 'postgrest', 'gateway', 'backoffice', 'personnel', 'customer', 'data-path-proof']) {
  checkNamed(startup, name);
}

assert(preflight.ready === true, 'Preflight evidence is not ready', preflight);
assert(proof.customerTenantAAllowedRowCount === 1, 'Tenant A customer must read exactly one Tenant A assignment', proof);
assert(proof.customerTenantADeniedTenantBRowCount === 0, 'Tenant A customer must not read Tenant B assignment', proof);
assert(proof.customerTenantBDeniedTenantARowCount === 0, 'Tenant B customer must not read Tenant A assignment', proof);
assert(proof.expiredJwtStatus >= 400, 'Expired JWT must be rejected', proof);
assert(proof.personnelTenantAAssignedTenantA === true, 'Tenant A personnel RPC must allow Tenant A assignment', proof);
assert(proof.personnelTenantAAssignedTenantB === false, 'Tenant A personnel RPC must deny Tenant B assignment', proof);
assert(proof.personnelTenantBAssignedTenantA === false, 'Tenant B personnel RPC must deny Tenant A assignment', proof);
assert(proof.unknownRouteStatus === 404, 'Unknown gateway route must return 404', proof);
assert(proof.serviceRoleBrowserBypassDetected === false, 'Service-role browser bypass must be absent', proof);
assert(proof.jwtAlgorithm === 'HS256', 'JWT algorithm must be HS256', proof);
assert(proof.jwtRole === 'authenticated', 'JWT role must be authenticated', proof);
assert(proof.jwtSub === '20000000-0000-4000-8000-000000000105', 'JWT subject must be the Tenant A customer fixture user', proof);
assert(proof.jwtMaximumLifetimeSeconds <= 900, 'JWT maximum lifetime must be at most 900 seconds', proof);
assert(proof.postgrestVersion === 'postgrest/postgrest:v12.2.8', 'PostgREST version evidence mismatch', proof);

assert(fixtures.status === 'passed', 'E2E fixtures did not pass verification', fixtures);
assert(fixtures.assignmentPersonnelLinkCount > 0, 'Assignment-personnel link fixture is missing', fixtures);
assert(fixtures.inactivePersonnelCount === 1, 'Inactive personnel fixture count mismatch', fixtures);
assert(fixtures.reportCount === 1, 'Approved report fixture count mismatch', fixtures);
assert(fixtures.invoiceCount === 1, 'Invoice fixture count mismatch', fixtures);
assert(fixtures.customerUserCount === 1, 'Customer-user natural-key fixture count mismatch', fixtures);
assert(fixtures.customerUserByUserCount === 1, 'Customer-user/customer fixture count mismatch', fixtures);
assert(fixtures.tenantAAdminCanonicalRoleCount === 1, 'Tenant A canonical admin role fixture count mismatch', fixtures);
assert(fixtures.tenantBAdminCanonicalRoleCount === 1, 'Tenant B canonical admin role fixture count mismatch', fixtures);
assert(fixtures.crossTenantAdminRoleLeakCount === 0, 'Cross-tenant admin role leak detected', fixtures);
assert(fixtures.crossTenantValidation?.tenantBAssignmentInTenantACount === 0, 'Cross-tenant fixture validation failed', fixtures);

for (const name of [
  'backoffice.stdout.log',
  'backoffice.stderr.log',
  'personnel.stdout.log',
  'personnel.stderr.log',
  'customer.stdout.log',
  'customer.stderr.log',
  'orchestrator.stdout.log',
  'orchestrator.stderr.log',
  'postgrest.log',
]) {
  requireLog(name);
}

console.log('Fieldgrid Playwright runtime evidence passed');
