import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "lib/db/migrations/20260729110000_website_active_primary_domain_binding.sql",
  "utf8",
);

test("website domain binding accepts only trusted active or verified tenant domains", () => {
  assert.equal(
    (
      migration.match(
        /verification_status NOT IN \('verified', 'active'\)/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.match(migration, /tenant_domain\.type = 'platform_reserved'/u);
  assert.match(migration, /tenant_domain\.verified_at IS NULL/u);
  assert.match(migration, /tenant_domain\.disabled_at IS NOT NULL/u);
  assert.match(migration, /domain_row\.type = 'platform_reserved'/u);
  assert.match(migration, /domain_row\.verified_at IS NULL/u);
  assert.match(migration, /domain_row\.disabled_at IS NOT NULL/u);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.website_validate_domain_binding/u,
  );
});

test("website domain binding keeps revision, ownership and audit invariants", () => {
  assert.match(migration, /FOR UPDATE/u);
  assert.match(
    migration,
    /current_site\.authoring_revision <> p_expected_authoring_revision/u,
  );
  assert.match(migration, /website module entitlement is required/u);
  assert.match(migration, /website domain is already bound to another site/u);
  assert.match(migration, /authoring_revision = authoring_revision \+ 1/u);
  assert.match(migration, /website_primary_domain_changed/u);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.set_primary_website_domain/u,
  );
});

test("platform primary-domain selection and binding share one database transaction", () => {
  assert.match(
    migration,
    /FUNCTION public\.bind_primary_tenant_domain_to_website/u,
  );
  assert.match(
    migration,
    /WHERE tenant_id = p_tenant_id[\s\S]*is_primary = true[\s\S]*verification_status IN \('verified', 'active'\)[\s\S]*disabled_at IS NULL[\s\S]*FOR UPDATE/u,
  );
  assert.match(migration, /RETURN public\.set_primary_website_domain\(/u);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.bind_primary_tenant_domain_to_website/u,
  );
});
