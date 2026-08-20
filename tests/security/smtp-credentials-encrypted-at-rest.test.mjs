import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("tenant SMTP schema is additive and rejects new plaintext writes", async () => {
  const migration = await read(
    "lib/db/migrations/20260820105112_smtp_credentials_encrypted_at_rest.sql",
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS smtp_password_encrypted text/u,
  );
  assert.match(migration, /fieldgrid_reject_plaintext_smtp_password/u);
  assert.match(migration, /SECURITY INVOKER/u);
  assert.match(
    migration,
    /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated, service_role/u,
  );
  assert.doesNotMatch(
    migration,
    /FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY|base64:|hex:/u,
  );
});

test("normal tenant SMTP reads and writes use only the encrypted credential", async () => {
  const service = await read("lib/db/src/email-service.ts");
  const settings = await read(
    "artifacts/backoffice/src/app/actions/settings.ts",
  );

  assert.match(
    service,
    /smtpPasswordEncrypted: organizationSettingsTable\.smtpPasswordEncrypted/u,
  );
  assert.match(service, /decryptTenantSmtpPassword/u);
  assert.doesNotMatch(service, /organizationSettingsTable\.smtpPassword[,)]/u);
  assert.match(settings, /encryptTenantSmtpPassword/u);
  assert.match(settings, /smtpPasswordEncrypted/u);
  assert.match(settings, /updateData\.smtpPassword = null/u);
  assert.doesNotMatch(
    settings,
    /updateData\.smtpPassword = data\.smtpPassword/u,
  );
  assert.match(
    settings,
    /smtpPasswordConfigured: Boolean\(r\.smtpPasswordEncrypted\)/u,
  );
});

test("backfill is explicit, tenant-transactional, idempotent and secret-safe", async () => {
  const backfill = await read("scripts/fieldgrid-smtp-credential-backfill.mts");
  assert.match(backfill, /for update/iu);
  assert.match(backfill, /smtp_password_encrypted = \$2/u);
  assert.match(backfill, /smtp_password = null/iu);
  assert.match(backfill, /legacy_plaintext_count/u);
  assert.match(backfill, /FIELDGRID_SMTP_BACKFILL_CONFIRM/u);
  assert.match(backfill, /result=already_migrated/u);
  assert.doesNotMatch(backfill, /log\([^\n]*smtp_password/iu);
});

test("staging deployment backfills before activation and production remains read-only", async () => {
  const backfill = await read("scripts/fieldgrid-smtp-credential-backfill.mts");
  const deploy = await read(".github/workflows/deploy.yml");
  assert.match(backfill, /assertDatabaseEnvironmentIsolation/u);
  assert.match(backfill, /isolation\.environment !== "staging"/u);
  assert.match(backfill, /GITHUB_REF_NAME/u);
  assert.doesNotMatch(backfill, /FIELDGRID_DEPLOY_ENV/u);
  assert.match(
    deploy,
    /Run database migrations[\s\S]*Backfill staging SMTP credentials[\s\S]*Verify no plaintext SMTP credentials remain[\s\S]*Activate release/u,
  );
  assert.match(
    deploy,
    /Backfill staging SMTP credentials[\s\S]*if: env\.TARGET == 'staging'[\s\S]*fieldgrid:smtp-credential-backfill --apply/u,
  );
});
