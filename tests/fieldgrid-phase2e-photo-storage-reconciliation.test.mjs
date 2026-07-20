import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "lib/db/migrations/20260716142900_staging_demo_assignment_photo_paths.sql";
const participantMigrationPath =
  "lib/db/migrations/20260716143000_assignment_participant_execution.sql";
const migration = readFileSync(migrationPath, "utf8");
const seed = readFileSync("lib/db/src/seed/staging-demo.ts", "utf8");

test("legacy staging-demo photo metadata is audited and canonicalized before participant backfill", () => {
  assert.ok(migrationPath < participantMigrationPath);
  assert.match(
    migration,
    /lock table public\.assignment_photos in share row exclusive mode/iu,
  );
  assert.match(migration, /migration_storage_path_reconciled/iu);
  assert.match(migration, /oldStoragePath/iu);
  assert.match(migration, /newStoragePath/iu);
  assert.match(
    migration,
    /where photo\.tenant_id is not null[\s\S]*photo\.storage_path like 'staging-demo\/photos\/%'/iu,
  );
  assert.match(
    migration,
    /'tenant\/' \|\| photo\.tenant_id::text \|\| '\/assignments\/' \|\|[\s\S]*photo\.assignment_id::text/iu,
  );
});

test("the staging demo seed writes canonical tenant and assignment photo paths", () => {
  assert.match(
    seed,
    /'tenant\/' \|\| assignment\.tenant_id::text \|\| '\/assignments\/' \|\| assignment\.id::text/iu,
  );
  assert.doesNotMatch(seed, /"staging-demo\/photos\/binckhorst/iu);
  assert.match(
    seed,
    /delete from assignment_photos[\s\S]*assignment_id in \([\s\S]*select id from assignments where notes like \$1/iu,
  );
});
