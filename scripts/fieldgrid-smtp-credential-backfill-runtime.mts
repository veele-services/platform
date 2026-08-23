#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import {
  decryptTenantSmtpPassword,
} from "../lib/db/src/email-secret-crypto.ts";
import { applySmtpCredentialBackfill } from "./fieldgrid-smtp-credential-backfill.mts";
import {
  FIXTURE,
  assert,
  assertDisposableDatabaseForReset,
  connect,
} from "./fieldgrid-runtime-safety-lib.mjs";

const tenantIds = [FIXTURE.tenants.a, FIXTURE.tenants.b] as const;
const previousKey = process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY;
process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;

const client = await connect();
const secretA = randomBytes(24).toString("base64url");
const secretB = randomBytes(24).toString("base64url");
const logs: string[] = [];

try {
  await assertDisposableDatabaseForReset(client);
  await client.query(
    `insert into public.organization_settings (tenant_id, naam)
     values ($1::uuid, 'Runtime tenant A'), ($2::uuid, 'Runtime tenant B')
     on conflict (tenant_id) do nothing`,
    tenantIds,
  );
  await client.query(`
    alter table public.organization_settings
    disable trigger organization_settings_reject_plaintext_smtp_password
  `);
  try {
    await client.query(
      `update public.organization_settings
       set smtp_password = case tenant_id
         when $1::uuid then $3
         when $2::uuid then $4
       end,
       smtp_password_encrypted = null
       where tenant_id in ($1::uuid, $2::uuid)`,
      [tenantIds[0], tenantIds[1], secretA, secretB],
    );
  } finally {
    await client.query(`
      alter table public.organization_settings
      enable trigger organization_settings_reject_plaintext_smtp_password
    `);
  }

  let plaintextRejected = false;
  try {
    await client.query(
      `update public.organization_settings set smtp_password = $2 where tenant_id = $1`,
      [tenantIds[0], "runtime-plaintext-write-must-fail"],
    );
  } catch (error) {
    plaintextRejected = (error as { code?: string }).code === "23514";
  }
  assert(plaintextRejected, "database trigger accepted a plaintext SMTP credential");

  const first = await applySmtpCredentialBackfill(client, (message) => logs.push(message));
  assert(first.migrated === 2, "expected both tenant SMTP credentials to migrate", first);
  assert(first.remaining.legacyPlaintextCount === 0, "plaintext SMTP credentials remain");
  assert(logs.every((line) => !line.includes(secretA) && !line.includes(secretB)), "backfill log leaked a secret");

  const stored = await client.query<{
    tenant_id: string;
    smtp_password: string | null;
    smtp_password_encrypted: string | null;
  }>(
    `select tenant_id, smtp_password, smtp_password_encrypted
     from public.organization_settings
     where tenant_id in ($1::uuid, $2::uuid)
     order by tenant_id`,
    tenantIds,
  );
  assert(stored.rows.length === 2, "runtime fixtures are missing organization settings");
  assert(stored.rows.every((row) => row.smtp_password === null), "database still exposes a plaintext SMTP password");

  const rowA = stored.rows.find((row) => row.tenant_id === tenantIds[0]);
  const rowB = stored.rows.find((row) => row.tenant_id === tenantIds[1]);
  assert(Boolean(rowA?.smtp_password_encrypted), "tenant A encrypted SMTP password is missing");
  assert(Boolean(rowB?.smtp_password_encrypted), "tenant B encrypted SMTP password is missing");
  assert(
    decryptTenantSmtpPassword(tenantIds[0], rowA!.smtp_password_encrypted) === secretA,
    "tenant A encrypted SMTP password did not roundtrip",
  );
  assert(
    decryptTenantSmtpPassword(tenantIds[1], rowB!.smtp_password_encrypted) === secretB,
    "tenant B encrypted SMTP password did not roundtrip",
  );

  let crossTenantRejected = false;
  try {
    decryptTenantSmtpPassword(tenantIds[0], rowB!.smtp_password_encrypted);
  } catch {
    crossTenantRejected = true;
  }
  assert(crossTenantRejected, "tenant A decrypted tenant B SMTP ciphertext");

  const second = await applySmtpCredentialBackfill(client, (message) => logs.push(message));
  assert(second.migrated === 0, "second SMTP backfill run was not idempotent", second);

  console.log("FG-SMTP-CREDENTIAL-ENCRYPTION runtime proof passed");
} finally {
  await client.query(
    `update public.organization_settings
     set smtp_password = null, smtp_password_encrypted = null
     where tenant_id in ($1::uuid, $2::uuid)`,
    tenantIds,
  );
  await client.end();
  if (previousKey === undefined) delete process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY;
  else process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY = previousKey;
}
