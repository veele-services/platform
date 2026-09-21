import { createHash } from "node:crypto";
import { APPLICATION_TABLES, MIGRATION_JOURNALS, assertRelationClassification } from "./fieldgrid-v1-wp1-reset-plan.mjs";
import { assertMigrationAdminUrl, STAGING_PROJECT_REF } from "./fieldgrid-w00-runtime-principal.mjs";
import { databaseNodePostgresSslConfig } from "./fieldgrid-database-root-cert.mjs";

const RESET_LOCK = "fieldgrid:wp1:clean-base:v1";
export const STORAGE_SCOPE = Object.freeze([
  { bucket: "documents", prefix: "staging-demo/" }, { bucket: "assignment-photos", prefix: "staging-demo/" },
  { bucket: "org-assets", prefix: "staging-demo/" }, { bucket: "personnel-avatars", prefix: "staging-demo/" },
]);
const AUTH_PAGE_SIZE = 100;
const STORAGE_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 50;
const safeError = (error) => new Error(`WP1 provider operation failed: ${String(error?.message ?? "unknown").replace(/https?:\/\/[^\s]+|[A-Za-z0-9_-]{24,}/gu, "[redacted]")}`);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Real bounded Postgres adapter. It never interpolates caller-provided identifiers. */
export function createWp1DatabaseAdapter(connectionString, { bootstrapCanonical, env = process.env } = {}) {
  if (typeof bootstrapCanonical !== "function") throw new Error("Canonical bootstrap binding is required");
  if (env.APP_ENV !== "staging" || env.EXPECTED_SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) throw new Error("WP1 database target must be the staging project");
  if (String(env.FIELDGRID_DATABASE_CONNECTION_PURPOSE) !== "migration") throw new Error("WP1 database connection purpose must be migration");
  assertMigrationAdminUrl(connectionString, "staging");
  const ssl = databaseNodePostgresSslConfig(env);
  async function withClient(work) {
    // pg is intentionally resolved only in the DB execution lane (@workspace/db owns it);
    // provider-contract tests do not need a database driver installed at the repo root.
    const { default: pg } = await import("pg");
    const { Client } = pg;
    const client = new Client({ connectionString, ssl }); await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  async function journals(client) {
    const entries = [];
    for (const relation of MIGRATION_JOURNALS) {
      const [schema, table] = relation.split(".");
      const result = await client.query(`SELECT row_to_json(j)::text AS row FROM ${schema}.${table} j ORDER BY 1`);
      entries.push([relation, result.rows.map((row) => row.row)]);
    }
    return digest(entries);
  }
  return {
    async inventory() { return withClient(async (client) => {
      const applicationCounts = {};
      for (const table of APPLICATION_TABLES) applicationCounts[table] = Number((await client.query(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count);
      return { applicationCounts, migrationJournals: await journals(client) };
    }); },
    async deleteAllowlisted(relations) {
      assertRelationClassification(relations);
      if (relations.some((relation) => !APPLICATION_TABLES.includes(relation))) throw new Error("Reset blocked: non-destructive relation requested");
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [RESET_LOCK]);
          const before = await journals(client);
          const ranks = new Map(APPLICATION_TABLES.map((table, index) => [table, index]));
          const fks = await client.query("SELECT child.relname AS child, parent.relname AS parent FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND ns.nspname='public'");
          for (const { child, parent } of fks.rows) if (ranks.has(child) && ranks.has(parent) && ranks.get(child) > ranks.get(parent)) throw new Error(`Reset blocked: FK delete order ${child}->${parent} is unsafe`);
          // DELETE only; no TRUNCATE CASCADE.
          for (const table of APPLICATION_TABLES) await client.query(`DELETE FROM public.${table}`);
          if (before !== await journals(client)) throw new Error("Reset blocked: migration journal changed");
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    },
    bootstrapCanonical,
    async journalFingerprint() { return withClient(journals); },
  };
}

/** Official Supabase Admin API wrapper; inputs are already classified, opaque candidates. */
export function createWp1SupabaseAdapters(adminClient, { candidateIdentity, preserveIdentity }) {
  async function authCandidates() {
    const candidates = []; let page = 1;
    for (;;) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
      if (error) throw safeError(error);
      const users = data?.users ?? [];
      for (const user of users) {
        const classified = candidateIdentity(user);
        if (classified === "unknown") throw new Error("Reset blocked: ambiguous Auth identity");
        if (classified === "candidate" && !preserveIdentity(user)) candidates.push(user.id);
      }
      if (users.length < AUTH_PAGE_SIZE) return candidates.sort(); page += 1;
    }
  }
  async function retry(operation) {
    for (let attempt = 0; attempt < 3; attempt += 1) { const result = await operation(); if (!result?.error || ![429, 500, 502, 503, 504].includes(result.error.status)) return result; }
    return operation();
  }
  async function storageInventory() {
    const inventory = [];
    for (const scope of STORAGE_SCOPE) {
      for (let offset = 0;; offset += STORAGE_PAGE_SIZE) {
        const { data, error } = await retry(() => adminClient.storage.from(scope.bucket).list(scope.prefix, { limit: STORAGE_PAGE_SIZE, offset }));
        if (error) throw safeError(error);
        for (const item of data ?? []) inventory.push({ bucket: scope.bucket, path: `${scope.prefix}${item.name}` });
        if ((data ?? []).length < STORAGE_PAGE_SIZE) break;
      }
    }
    return inventory.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
  }
  return {
    auth: { candidates: authCandidates, async removeCandidatesExactly(expected) {
      if (JSON.stringify(await authCandidates()) !== JSON.stringify(expected)) throw new Error("Reset blocked: Auth inventory changed");
      for (const id of expected) { const { error } = await adminClient.auth.admin.deleteUser(id); if (error && error.status !== 404) throw safeError(error); }
    } },
    storage: { inventory: storageInventory, async removeInventoryExactly(expected) {
      if (JSON.stringify(await storageInventory()) !== JSON.stringify(expected)) throw new Error("Reset blocked: storage inventory changed");
      for (const scope of STORAGE_SCOPE) { const paths = expected.filter((x) => x.bucket === scope.bucket).map((x) => x.path); for (let start = 0; start < paths.length; start += DELETE_BATCH_SIZE) { const { error } = await retry(() => adminClient.storage.from(scope.bucket).remove(paths.slice(start, start + DELETE_BATCH_SIZE))); if (error && error.status !== 404) throw safeError(error); } }
      if ((await storageInventory()).length) throw new Error("Reset blocked: storage objects remain");
    } },
  };
}
