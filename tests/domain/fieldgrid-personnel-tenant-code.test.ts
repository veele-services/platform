import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidPersonnelTenantCode,
  normalizePersonnelTenantCode,
  PERSONNEL_TENANT_CODE_LENGTH,
  PERSONNEL_TENANT_CODE_PATTERN,
} from "../../lib/db/src/personnel-tenant-code";

test("tenant codes normalize to six unambiguous uppercase characters", () => {
  assert.equal(PERSONNEL_TENANT_CODE_LENGTH, 6);
  assert.equal(normalizePersonnelTenantCode(" ab-c234 "), "ABC234");
  assert.equal(normalizePersonnelTenantCode("oi10-ab23"), "AB23");
  assert.match("VEEL23", PERSONNEL_TENANT_CODE_PATTERN);
});

test("tenant code validation rejects short, long and ambiguous values", () => {
  assert.equal(isValidPersonnelTenantCode("ABC234"), true);
  assert.equal(isValidPersonnelTenantCode("abc234"), true);
  assert.equal(isValidPersonnelTenantCode("ABC23"), false);
  assert.equal(isValidPersonnelTenantCode("ABC2345"), false);
  assert.equal(isValidPersonnelTenantCode("ABC01O"), false);
  assert.equal(isValidPersonnelTenantCode(null), false);
});
