import assert from "node:assert/strict";
import test from "node:test";

import {
  OBJECT_SECURITY_ACCESS_PATH_STATUS,
  isObjectSecurityLegacyBackfillEnabled,
  isObjectSecurityManagementAccessEnabled,
} from "../../lib/db/src/object-security-capabilities.ts";

test("unfinished object-security paths and backfill fail closed by default", () => {
  assert.equal(isObjectSecurityManagementAccessEnabled({}), false);
  assert.equal(isObjectSecurityLegacyBackfillEnabled({}), false);
  assert.equal(
    OBJECT_SECURITY_ACCESS_PATH_STATUS.personnel,
    "placeholder_fail_closed",
  );
  assert.equal(
    OBJECT_SECURITY_ACCESS_PATH_STATUS.customer,
    "placeholder_fail_closed",
  );
  assert.equal(
    OBJECT_SECURITY_ACCESS_PATH_STATUS.breakGlass,
    "placeholder_fail_closed",
  );
});

test("object-security flags require an explicit true value", () => {
  assert.equal(
    isObjectSecurityManagementAccessEnabled({
      FIELDGRID_OBJECT_SECURITY_MANAGEMENT_ACCESS_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    isObjectSecurityManagementAccessEnabled({
      FIELDGRID_OBJECT_SECURITY_MANAGEMENT_ACCESS_ENABLED: "TRUE",
    }),
    false,
  );
  assert.equal(
    isObjectSecurityLegacyBackfillEnabled({
      FIELDGRID_OBJECT_SECURITY_LEGACY_BACKFILL_ENABLED: "true",
    }),
    true,
  );
});
