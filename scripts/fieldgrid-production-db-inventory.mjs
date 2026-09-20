#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { databaseNodePostgresSslConfig } from './fieldgrid-database-root-cert.mjs';

export function validateProductionInventoryConfig(env) {
  const projectRef = 'ckdtiuemeygrnujjibnw';
  const connectionString = env.FIELDGRID_MIGRATION_DATABASE_URL;
  const url = new URL(connectionString);
  const direct = url.hostname === `db.${projectRef}.supabase.co` && url.username === 'postgres';
  const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/u.test(url.hostname)
    && decodeURIComponent(url.username) === `postgres.${projectRef}`;
  if (env.APP_ENV !== 'production' || env.TARGET_ENVIRONMENT !== 'production'
      || env.GITHUB_REPOSITORY !== 'veele-services/platform'
      || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || (!direct && !pooler) || url.search || url.hash || url.pathname !== '/postgres'
      || !['postgres:', 'postgresql:'].includes(url.protocol)
      || !['5432', '6543'].includes(url.port) || !url.password) {
    throw new Error('invalid production descriptor');
  }
  return { connectionString, url, projectRef };
}

export async function productionInventory(env = process.env) {
  const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
  const { Client } = require('pg');
  let client;
  try {
    const { connectionString, url, projectRef } = validateProductionInventoryConfig(env);
  client = new Client({connectionString, ssl: databaseNodePostgresSslConfig(env), connectionTimeoutMillis: 15000});
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query('SET LOCAL search_path = pg_catalog');
  const roles = await client.query(`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
    FROM pg_roles WHERE rolname IN (current_user, 'fieldgrid_runtime_app', 'fieldgrid_runtime_data') ORDER BY rolname`);
  const schemas = await client.query(`SELECT nspname FROM pg_namespace
    WHERE nspname IN ('public', 'auth', 'storage', 'drizzle') ORDER BY nspname`);
  const relations = await client.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname LIMIT 500`);
  const historyExists = await client.query("SELECT to_regclass('drizzle.veele_sql_migrations') IS NOT NULL AS present");
  const history = historyExists.rows[0].present
    ? (await client.query('SELECT name, hash, baselined FROM drizzle.veele_sql_migrations ORDER BY applied_at, name LIMIT 600')).rows : [];
  const counts = {};
  for (const name of ['public.tenants', 'auth.users', 'public.assignments', 'public.customers', 'public.personnel', 'public.platform_email_providers']) {
    const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [name]);
    counts[name] = exists.rows[0].present
      ? (await client.query(`SELECT count(*)::int AS count FROM ${name}`)).rows[0].count : null;
  }
  await client.query('ROLLBACK');
  process.stdout.write(JSON.stringify({version: 1, environment: 'production', sourceSha: env.GITHUB_SHA,
    projectRef, databaseHost: url.hostname, databasePort: url.port,
    roles: roles.rows, schemas: schemas.rows, relations: relations.rows, history, counts}, null, 2) + '\n');
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  process.stderr.write('Production database inventory failed; no connection details or row payloads logged.\n');
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await productionInventory();
