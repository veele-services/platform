#!/usr/bin/env node
import { createRequire } from 'node:module';
import { databaseNodePostgresSslConfig } from './fieldgrid-database-root-cert.mjs';

const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Client } = require('pg');
const env = process.env;
const ref = 'olyfmekyqozxrbrwwszu';
const connectionString = env.FIELDGRID_MIGRATION_DATABASE_URL;
let client;
try {
  const url = new URL(connectionString);
  const projectBound = (url.hostname === `db.${ref}.supabase.co`
      && decodeURIComponent(url.username) === 'postgres')
    || (/^aws-[0-9]+-eu-central-1\.pooler\.supabase\.com$/u.test(url.hostname)
      && decodeURIComponent(url.username) === `postgres.${ref}`);
  if (env.APP_ENV !== 'staging' || env.TARGET_ENVIRONMENT !== 'staging'
      || env.GITHUB_REPOSITORY !== 'veele-services/platform'
      || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || !projectBound || url.port !== '5432' || !url.password
      || url.search || url.hash || url.pathname !== '/postgres'
      || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('invalid configuration');
  }
  client = new Client({connectionString, ssl: databaseNodePostgresSslConfig(env), connectionTimeoutMillis: 15000});
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query('SET LOCAL search_path = pg_catalog');
  const helpers = await client.query(`
    SELECT n.nspname AS schema, p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_userbyid(p.proowner) AS owner,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'grantor', pg_get_userbyid(a.grantor), 'privilege', a.privilege_type, 'grantable', a.is_grantable)
        ORDER BY a.grantee, a.grantor)
        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a), '[]'::jsonb) AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'auth' AND p.proname IN ('uid', 'role') AND p.pronargs = 0)
       OR (n.nspname = 'public' AND p.proname = 'customer_has_access'
           AND p.proargtypes = '2950 2950'::oidvector)
    ORDER BY n.nspname, p.proname LIMIT 4`);
  const tenants = await client.query(`
    SELECT d.domain AS hostname, t.id AS tenant_id, t.slug, t.status,
      (SELECT count(*)::int FROM public.organization_settings s WHERE s.tenant_id = t.id) AS settings_count
    FROM public.tenant_domains d JOIN public.tenants t ON t.id = d.tenant_id
    WHERE d.domain = ANY($1::text[]) ORDER BY d.domain LIMIT 4`,
    [['field-demo.staging.fieldgrid.nl', 'field-demo.fieldgrid.nl', 'managed-proof-w00-v2.staging.fieldgrid.nl']]);
  await client.query('ROLLBACK');
  process.stdout.write(JSON.stringify({version: 1, environment: 'staging', sourceSha: env.GITHUB_SHA,
    helpers: helpers.rows, tenants: tenants.rows}, null, 2) + '\n');
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  process.stderr.write('Deployment database inventory failed; no connection details or row payloads logged.\n');
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
