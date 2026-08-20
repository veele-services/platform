#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  assertEmailEncryptionKeyConfigured,
  encryptTenantSmtpPassword,
} from "../lib/db/src/email-secret-crypto.ts";

const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg") as typeof import("pg");
const APPLY_CONFIRMATION = "smtp-encrypted-at-rest-v1";

type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

export type SmtpCredentialBackfillCounts = {
  legacyPlaintextCount: number;
  conflictingEncryptedCount: number;
};

export async function inspectSmtpCredentialBackfill(
  client: Queryable,
): Promise<SmtpCredentialBackfillCounts> {
  const result = await client.query<{
    legacy_plaintext_count: number | string;
    conflicting_encrypted_count: number | string;
  }>(`
    select
      count(*) filter (
        where smtp_password is not null and btrim(smtp_password) <> ''
      )::int as legacy_plaintext_count,
      count(*) filter (
        where smtp_password is not null
          and btrim(smtp_password) <> ''
          and smtp_password_encrypted is not null
      )::int as conflicting_encrypted_count
    from public.organization_settings
  `);
  return {
    legacyPlaintextCount: Number(result.rows[0]?.legacy_plaintext_count ?? 0),
    conflictingEncryptedCount: Number(
      result.rows[0]?.conflicting_encrypted_count ?? 0,
    ),
  };
}

export async function applySmtpCredentialBackfill(
  client: Queryable,
  log: (message: string) => void = console.log,
): Promise<{ migrated: number; remaining: SmtpCredentialBackfillCounts }> {
  assertEmailEncryptionKeyConfigured();
  const before = await inspectSmtpCredentialBackfill(client);
  if (before.conflictingEncryptedCount > 0) {
    throw new Error(
      "SMTP credential backfill refused conflicting plaintext and encrypted rows.",
    );
  }

  await client.query(`
    update public.organization_settings
    set smtp_password = null
    where smtp_password is not null and btrim(smtp_password) = ''
  `);

  const candidates = await client.query<{ tenant_id: string }>(`
    select tenant_id
    from public.organization_settings
    where smtp_password is not null and btrim(smtp_password) <> ''
    order by tenant_id
  `);

  let migrated = 0;
  for (const candidate of candidates.rows) {
    const tenantId = candidate.tenant_id;
    await client.query("begin");
    try {
      const locked = await client.query<{
        smtp_password: string | null;
        smtp_password_encrypted: string | null;
      }>(
        `select smtp_password, smtp_password_encrypted
         from public.organization_settings
         where tenant_id = $1
         for update`,
        [tenantId],
      );
      const row = locked.rows[0];
      if (!row?.smtp_password) {
        await client.query("commit");
        log(`tenant=${tenantId} result=already_migrated`);
        continue;
      }
      if (row.smtp_password_encrypted) {
        throw new Error("Conflicting SMTP credential state encountered during backfill.");
      }

      const encrypted = encryptTenantSmtpPassword(tenantId, row.smtp_password);
      const updated = await client.query(
        `update public.organization_settings
         set smtp_password_encrypted = $2,
             smtp_password = null,
             updated_at = now()
         where tenant_id = $1
           and smtp_password is not null
           and smtp_password_encrypted is null`,
        [tenantId, encrypted],
      );
      if (updated.rowCount !== 1) {
        throw new Error("SMTP credential row changed concurrently during backfill.");
      }
      await client.query("commit");
      migrated += 1;
      log(`tenant=${tenantId} result=migrated`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const remaining = await inspectSmtpCredentialBackfill(client);
  if (
    remaining.legacyPlaintextCount !== 0 ||
    remaining.conflictingEncryptedCount !== 0
  ) {
    throw new Error("SMTP credential backfill finished with plaintext rows remaining.");
  }
  return { migrated, remaining };
}

function assertSafeTarget(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const environment = String(process.env.FIELDGRID_DEPLOY_ENV ?? "").toLowerCase();
  if (
    environment === "production" ||
    /(?:^|[.-])prod(?:uction)?(?:[.-]|$)/iu.test(parsed.hostname)
  ) {
    throw new Error("Production SMTP credential backfill is disabled by this remediation tool.");
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--apply") ? "apply" : "check";
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for SMTP credential backfill.");
  assertSafeTarget(databaseUrl);
  if (
    mode === "apply" &&
    process.env.FIELDGRID_SMTP_BACKFILL_CONFIRM !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Set FIELDGRID_SMTP_BACKFILL_CONFIRM=${APPLY_CONFIRMATION} before applying the SMTP credential backfill.`,
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    if (mode === "apply") {
      const result = await applySmtpCredentialBackfill(client);
      console.log(
        JSON.stringify({
          migrated_count: result.migrated,
          legacy_plaintext_count: result.remaining.legacyPlaintextCount,
          conflicting_encrypted_count:
            result.remaining.conflictingEncryptedCount,
        }),
      );
      return;
    }

    const counts = await inspectSmtpCredentialBackfill(client);
    console.log(
      JSON.stringify({
        legacy_plaintext_count: counts.legacyPlaintextCount,
        conflicting_encrypted_count: counts.conflictingEncryptedCount,
      }),
    );
    if (counts.legacyPlaintextCount > 0 || counts.conflictingEncryptedCount > 0) {
      throw new Error("Plaintext tenant SMTP credentials still require backfill.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "SMTP credential backfill failed.",
    );
    process.exitCode = 1;
  });
}
