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

assert(startup.ready === true, 'Startup evidence is not ready', startup);
for (const name of ['postgresql', 'postgrest', 'gateway', 'backoffice', 'personnel', 'customer', 'data-path-proof']) {
  checkNamed(startup, name);
}

assert(proof.tenantAAllowedRowCount > 0, 'Tenant A allowed row count must be positive', proof);
assert(proof.tenantBDeniedRowCount === 0, 'Tenant B row count must be denied for Tenant A identity', proof);
assert(proof.tenantBIdentityDeniedTenantARowCount === 0, 'Tenant B identity must not read Tenant A rows', proof);
assert(proof.invalidJwtStatus >= 400, 'Invalid or expired JWT must be rejected', proof);
assert(proof.unknownRouteStatus === 404, 'Unknown gateway route must return 404', proof);
assert(proof.serviceRoleBrowserBypassDetected === false, 'Service-role browser bypass must be absent', proof);
assert(proof.jwtAlgorithm === 'HS256', 'JWT algorithm must be HS256', proof);
assert(proof.jwtRole === 'authenticated', 'JWT role must be authenticated', proof);
assert(proof.jwtSub === '20000000-0000-4000-8000-000000000104', 'JWT subject must be the Tenant A personnel fixture user', proof);
assert(proof.jwtMaximumLifetimeSeconds <= 900, 'JWT maximum lifetime must be at most 900 seconds', proof);
assert(proof.postgrestVersion === 'postgrest/postgrest:v12.2.8', 'PostgREST version evidence mismatch', proof);

assert(fixtures.status === 'passed', 'E2E fixtures did not pass verification', fixtures);
assert(fixtures.assignmentPersonnelLinkCount > 0, 'Assignment-personnel link fixture is missing', fixtures);
assert(fixtures.inactivePersonnelCount === 1, 'Inactive personnel fixture count mismatch', fixtures);
assert(fixtures.reportCount === 1, 'Approved report fixture count mismatch', fixtures);
assert(fixtures.invoiceCount === 1, 'Invoice fixture count mismatch', fixtures);
assert(fixtures.customerUserCount > 0, 'Customer-user fixture count mismatch', fixtures);
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
