import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonnelTenantEntryUrl,
  isValidPersonnelTenantCode,
  normalizePersonnelPortalNextPath,
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

test("tenant entry URLs restore routing context before opening a safe portal path", () => {
  assert.equal(
    buildPersonnelTenantEntryUrl(
      "https://fieldgrid.nl/personeel",
      "abc234",
      "/wachtwoord-vergeten",
    ),
    "https://fieldgrid.nl/personeel/organisatie/ABC234?next=%2Fwachtwoord-vergeten",
  );
  assert.equal(
    normalizePersonnelPortalNextPath("/personeel/opdrachten?status=open"),
    "/opdrachten?status=open",
  );
});

test("tenant entry URLs reject recursive and external redirects", () => {
  for (const unsafe of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/organisatie/ABC234",
    "/personeel/organisatie/ABC234",
    "/login#external",
  ]) {
    assert.equal(normalizePersonnelPortalNextPath(unsafe), "/login");
  }
  assert.throws(
    () =>
      buildPersonnelTenantEntryUrl("https://fieldgrid.nl/personeel", "invalid"),
    /Ongeldige personeelsorganisatiecode/u,
  );
});

test("tenant code validation rejects short, long and ambiguous values", () => {
  assert.equal(isValidPersonnelTenantCode("ABC234"), true);
  assert.equal(isValidPersonnelTenantCode("abc234"), true);
  assert.equal(isValidPersonnelTenantCode("ABC23"), false);
  assert.equal(isValidPersonnelTenantCode("ABC2345"), false);
  assert.equal(isValidPersonnelTenantCode("ABC01O"), false);
  assert.equal(isValidPersonnelTenantCode(null), false);
});
