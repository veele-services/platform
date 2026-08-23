#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  assertObjectSecurityCryptoConfigured,
  encryptObjectSecurityPayload,
} from "../lib/db/src/object-security-crypto.ts";
import { assertDatabaseEnvironmentIsolation } from "../lib/db/src/database-environment.ts";

const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg") as typeof import("pg");
const APPLY_CONFIRMATION = "object-security-encrypted-v1";

type LegacyRow = {
  id: string;
  tenant_id: string;
  created_by: string | null;
  access_info: string | null;
  key_info: string | null;
  alarm_info: string | null;
};

async function countLegacy(client: import("pg").PoolClient): Promise<number> {
  const result = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM public.objects
    WHERE access_info IS NOT NULL OR key_info IS NOT NULL OR alarm_info IS NOT NULL
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function applyBackfill(client: import("pg").PoolClient): Promise<number> {
  assertObjectSecurityCryptoConfigured();
  const candidates = await client.query<LegacyRow>(`
    SELECT id, tenant_id, created_by, access_info, key_info, alarm_info
    FROM public.objects
    WHERE access_info IS NOT NULL OR key_info IS NOT NULL OR alarm_info IS NOT NULL
    ORDER BY tenant_id, id
  `);
  let migrated = 0;
  await client.query("BEGIN");
  try {
    for (const candidate of candidates.rows) {
      const locked = await client.query<LegacyRow>(`
        SELECT id, tenant_id, created_by, access_info, key_info, alarm_info
        FROM public.objects WHERE tenant_id = $1 AND id = $2 FOR UPDATE
      `, [candidate.tenant_id, candidate.id]);
      const object = locked.rows[0];
      if (!object || (!object.access_info && !object.key_info && !object.alarm_info)) {
        continue;
      }
      const entries = [
        ["access_instructions", "Toegangsinstructies", object.access_info],
        ["key_management", "Sleutelbeheer", object.key_info],
        ["alarm_procedure", "Alarmprocedure", object.alarm_info],
      ] as const;
      for (const [category, title, plaintext] of entries) {
        if (!plaintext) continue;
        const conflict = await client.query(`
          SELECT id FROM public.object_security_records
          WHERE tenant_id = $1 AND object_id = $2 AND category = $3
          LIMIT 1 FOR UPDATE
        `, [object.tenant_id, object.id, category]);
        if (conflict.rowCount) throw new Error("Encrypted record conflicts with legacy plaintext backfill.");
        const revision = await client.query<{ generation: string }>(`
          SELECT generation::text FROM public.object_security_object_revisions
          WHERE tenant_id = $1 AND object_id = $2 FOR UPDATE
        `, [object.tenant_id, object.id]);
        const generation = Number(revision.rows[0]?.generation ?? 0) + 1;
        const recordId = randomUUID();
        const encrypted = encryptObjectSecurityPayload({ waarde: plaintext }, {
          tenantId: object.tenant_id,
          objectId: object.id,
          recordId,
          category,
          version: 1,
          generation,
        });
        await client.query(`
          INSERT INTO public.object_security_records (
            id, tenant_id, object_id, category, title, encrypted_payload,
            encryption_key_version, version, generation, status, source,
            change_reason, created_by, reviewed_by, reviewed_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,'active','legacy_backfill',
                    'Versleutelde migratie uit afgeschermde legacykolom',$9,$9,now())
        `, [recordId, object.tenant_id, object.id, category, title,
          encrypted.encryptedPayload, encrypted.keyVersion, generation,
          object.created_by ?? "00000000-0000-0000-0000-000000000000"]);
      }
      const cleared = await client.query(`
        UPDATE public.objects SET access_info = NULL, key_info = NULL, alarm_info = NULL
        WHERE tenant_id = $1 AND id = $2
          AND (access_info IS NOT NULL OR key_info IS NOT NULL OR alarm_info IS NOT NULL)
      `, [object.tenant_id, object.id]);
      if (cleared.rowCount !== 1) throw new Error("Legacy object changed concurrently.");
      migrated += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return migrated;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const isolation = assertDatabaseEnvironmentIsolation(process.env);
  if (apply && isolation.environment !== "staging") throw new Error("Legacy secret backfill apply is staging-only.");
  if (apply && process.env.FIELDGRID_OBJECT_SECURITY_BACKFILL_CONFIRM !== APPLY_CONFIRMATION) {
    throw new Error(`Set FIELDGRID_OBJECT_SECURITY_BACKFILL_CONFIRM=${APPLY_CONFIRMATION}.`);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const migrated = apply ? await applyBackfill(client) : 0;
    const remaining = await countLegacy(client);
    console.log(JSON.stringify({ migrated_count: migrated, legacy_plaintext_count: remaining }));
    if (remaining !== 0) throw new Error("Legacy object plaintext remains.");
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Object security backfill failed.");
    process.exitCode = 1;
  });
}
