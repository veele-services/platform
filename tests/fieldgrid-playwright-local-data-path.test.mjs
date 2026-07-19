import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('e2e/fieldgrid/start-real-apps.mjs', 'utf8');

test('contract: runtime data-path evidence is produced by gateway to real PostgREST requests', () => {
  assert.match(source, /proveDataPath/);
  assert.match(source, /gatewayJson\(`\/rest\/v1\/customer_assignment_projection\?id=eq\.\$\{tenantAAssignment\}/);
  assert.match(source, /gatewayJson\(`\/rest\/v1\/customer_assignment_projection\?id=eq\.\$\{tenantBAssignment\}/);
  assert.doesNotMatch(source, /gatewayJson\(`\/rest\/v1\/assignments\?id=eq\.\$\{tenant[AB]Assignment\}/);
  assert.match(source, /data-path-proof\.json/);
  assert.match(source, /\/rest\/v1\/rpc\/personnel_assigned_to_assignment/);
  assert.match(source, /customerTenantAAllowedAssignmentCount/);
  assert.match(source, /customerTenantADeniedTenantBAssignmentCount/);
  assert.match(source, /customerTenantBDeniedTenantAAssignmentCount/);
  assert.match(source, /personnelTenantAAssignmentAllowed/);
  assert.match(source, /personnelTenantATenantBAssignmentDenied/);
  assert.match(source, /personnelTenantBTenantAAssignmentDenied/);
  assert.match(source, /invalidJwtStatus/);
  assert.doesNotMatch(source, /\/rest\/v1\/assignment_personnel/);
});

test('contract: gateway preserves method, body, query, headers and PostgREST response details', () => {
  assert.match(source, /const incoming = new URL\(requestUrl, 'http:\/\/fieldgrid-e2e\.local'\)/);
  assert.match(source, /incoming\.pathname\.slice\('\/rest\/v1'\.length\)/);
  assert.match(source, /incoming\.search/);
  assert.doesNotMatch(source, /new URL\(req\.url, `http:\/\/127\.0\.0\.1:\$\{ports\.postgrest\}`\)/);
  assert.match(source, /method: req\.method/);
  assert.match(source, /body, duplex: 'half'/);
  for (const header of ['authorization', 'apikey', 'accept', 'content-type', 'prefer', 'range', 'content-range', 'accept-profile', 'content-profile']) {
    assert.match(source, new RegExp(header));
  }
  assert.match(source, /res\.statusCode = upstreamResponse\.status/);
  assert.match(source, /upstreamResponse\.arrayBuffer\(\)/);
});

test('contract: local JWT is HS256, short-lived and never logged as a secret', () => {
  assert.match(source, /alg: 'HS256'/);
  assert.match(source, /email: identity\.email/);
  assert.match(source, /jwtMaxLifetimeSeconds = 15 \* 60/);
  assert.match(source, /replaceAll\(localJwtSecret, '\[redacted-jwt-secret\]'\)/);
  assert.doesNotMatch(source, /tenant_id/);
});
