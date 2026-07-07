import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const lockedHistoricalSqlMigrations = {
  "026_personnel_sector.sql": "34c0a942aab732e6213dec9125fd155dfc764524a618a7a996868e32b6ad09e1",
  "036_notification_center.sql": "f5b02e7493f4d7e341028cae0ddb91b565023627984c20fc3824c342532ee09d",
  "037_tenant_customer_users_events_hardening.sql": "430bbc7029e3223abe31f11c13929e6a90ab44b2a9d1d4abe82d7ea567bb1d83",
  "038_customer_ticketing_backoffice.sql": "4af7f01ec1eeae290966d140f72277775b73acddd50f0ee61a3164baa86d92c4",
  "045_qualifications_management.sql": "3e011f3492cb92d982a1e4264ed1843b420c2611dc2a639af6353d92f015bd44",
  "055_tenant_rbac_backfill.sql": "52795f274297d52b7ec42a04020ca4d08ede9d39410c64cdd8d94a90d3bfbc2f",
  "056_fieldgrid_recovery_foundation.sql": "1c1c1dd04de6915efc6fcad7eb7fea67a5fdcbad47f2a0013941a7561a2d7ca2",
  "065_portal_branding_defaults.sql": "9a3e842e104d24b9be9123f48f946aacdf0a2a7fe086cbc94fef3a463d074a77",
};

test("historical SQL migrations with recorded staging hashes stay immutable", () => {
  for (const [filename, expectedHash] of Object.entries(lockedHistoricalSqlMigrations)) {
    const content = read(`lib/db/migrations/${filename}`);
    assert.equal(sha256(content), expectedHash, `${filename} hash changed; add a new migration instead of editing history`);
  }
});

test("Fieldgrid copy changes live in a timestamp repair migration", () => {
  const repair = read("lib/db/migrations/20260707191000_fieldgrid_legacy_copy_repair.sql");

  assert.match(repair, /Fieldgrid legacy copy repair/u);
  assert.match(repair, /UPDATE tenants/u);
  assert.match(repair, /Fieldgrid Default/u);
  assert.match(repair, /Factuur \{\{invoice\.number\}\} staat klaar/u);
  assert.match(repair, /Toegang tot het Fieldgrid-portaal/u);
  assert.match(repair, /Werken volgens organisatieprotocollen voor schoonmaak/u);
});
