import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content.replace(/\r\n/gu, "\n")).digest("hex");
}

const lockedHistoricalSqlMigrations = {
  "026_personnel_sector.sql": "e5d5bfa0291ae1a098b838020a45b932dedd2712f1f8c8979565abb1492ddd13",
  "036_notification_center.sql": "2226ec3cd4296cafc27f6967d576a9d399bce6529e1b611ffcb8675be8bdd118",
  "037_tenant_customer_users_events_hardening.sql": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e",
  "038_customer_ticketing_backoffice.sql": "7c9d32e9d4a908b0e45f544af7ab966b3535eabbdffcd73f42b200fbcb37996d",
  "045_qualifications_management.sql": "f73d447434454af426ef8b7f4a798e37038c4f9112a7023981cae79efb5d91d3",
  "055_tenant_rbac_backfill.sql": "e6181fcaa60c975f51c59cf1da4281af90043a8a244893e16e447304f8274eda",
  "056_fieldgrid_recovery_foundation.sql": "27848a82210b7cba2b638c73b6059f71fb4ecbe4b7813a140011f62ceb3a8b97",
  "065_portal_branding_defaults.sql": "546ed0007d1ccaf5b5de5681d1e30b18b8cd101183f620b3478c147d9de4f0d4",
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
