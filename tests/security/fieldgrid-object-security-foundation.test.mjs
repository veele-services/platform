import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("object security migration is additive, tenant-bound and server-only", async () => {
  const migration = await read(
    "lib/db/migrations/20260823104212_object_security_foundation.sql",
  );

  for (const table of [
    "object_security_records",
    "object_security_challenges",
    "object_security_unlock_sessions",
    "object_security_access_audit",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "u"));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "u"));
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`,
        "u",
      ),
    );
  }

  assert.match(migration, /FOREIGN KEY \(tenant_id, object_id\)[\s\S]*REFERENCES public\.objects \(tenant_id, id\)/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|DELETE\s+FROM\s+public\.objects/iu);
});

test("legacy plaintext object secrets are quarantined against new writes", async () => {
  const migration = await read(
    "lib/db/migrations/20260823104212_object_security_foundation.sql",
  );
  assert.match(migration, /fieldgrid_reject_legacy_object_secret_write/u);
  assert.match(migration, /NEW\.access_info IS DISTINCT FROM OLD\.access_info/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF access_info, key_info, alarm_info/u);
  assert.doesNotMatch(migration, /SET\s+(access_info|key_info|alarm_info)\s*=\s*NULL/iu);
});

test("object security records are versioned and audit is append-only", async () => {
  const migration = await read(
    "lib/db/migrations/20260823104212_object_security_foundation.sql",
  );
  assert.match(migration, /object_security_records_version_unique/u);
  assert.match(migration, /object_security_records_active_unique[\s\S]*WHERE status = 'active'/u);
  assert.match(migration, /fieldgrid_object_security_audit_append_only/u);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.object_security_access_audit/u);
});

test("OTP and unlock persistence contain hashes rather than plaintext tokens", async () => {
  const migration = await read(
    "lib/db/migrations/20260823104212_object_security_foundation.sql",
  );
  const crypto = await read("lib/db/src/object-security-crypto.ts");

  assert.match(migration, /code_hmac text/u);
  assert.match(migration, /handle_hash text NOT NULL UNIQUE/u);
  assert.doesNotMatch(migration, /\b(code_plaintext|unlock_token)\b/u);
  assert.match(crypto, /createHmac\("sha256"/u);
  assert.match(crypto, /timingSafeEqual/u);
  assert.match(crypto, /randomInt\(0, 1_000_000\)/u);
  assert.match(crypto, /randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.doesNotMatch(crypto, /console\.(?:log|error|warn)/u);
});
