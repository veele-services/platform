import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_SCHEMAS, DOMAIN, TENANT_ID, UUID, requireThat } from './contract.mjs';

// Provider relations, columns, functions, identities and roles are infrastructure,
// not old application data. Only app-owned auth triggers and storage policies may
// disappear with the app functions they call. This proof is checked BEFORE COMMIT.
export const PROTECTED_CATALOG_SQL = `
WITH protected_ns AS (
  SELECT oid,nspname FROM pg_namespace WHERE nspname <> ALL($1::text[])
    AND nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
), relations AS (
  SELECT c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.attnotnull) ORDER BY a.attnum)
     FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
  FROM pg_class c JOIN protected_ns n ON n.oid=c.relnamespace
), routines AS (
  SELECT p.oid,n.nspname,p.proname,p.prokind,p.prorettype,p.proargtypes::text,p.prosecdef,p.proconfig
  FROM pg_proc p JOIN protected_ns n ON n.oid=p.pronamespace
), hooks AS (
  SELECT t.oid,t.tgname,t.tgrelid,t.tgfoid,t.tgenabled FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN protected_ns n ON n.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
  WHERE pn.nspname <> ALL($1::text[])
    AND NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_class src ON src.oid=k.conrelid
      JOIN pg_namespace sn ON sn.oid=src.relnamespace WHERE k.oid=t.tgconstraint AND sn.nspname=ANY($1::text[]))
)
SELECT jsonb_build_object(
  'namespaces',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM protected_ns n),
  'relations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM relations r),
  'routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM routines p),
  'hooks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM hooks t),
  'extensions',(SELECT jsonb_agg(jsonb_build_array(oid,extname,extnamespace,extversion) ORDER BY oid) FROM pg_extension),
  'roles',(SELECT jsonb_agg(jsonb_build_array(oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) ORDER BY oid) FROM pg_roles)
) AS proof`;
export async function protectedCatalog(client) {
  const result = await client.query(PROTECTED_CATALOG_SQL, [APP_SCHEMAS]);
  requireThat(result.rows.length === 1 && result.rows[0].proof, 'MANAGED_CATALOG_UNAVAILABLE');
  return JSON.stringify(result.rows[0].proof);
}

export async function inspectDatabase(client) {
  const identity = (await client.query(`SELECT current_database() AS database, current_user AS principal,
    current_setting('server_version_num')::integer AS version`)).rows[0];
  requireThat(identity?.database === 'postgres' && identity.principal === 'postgres' &&
    identity.version >= 170000 && identity.version < 180000, 'DATABASE_IDENTITY_INVALID');
  await inspectResetCompatibility(client);
  return protectedCatalog(client);
}
export async function inspectResetCompatibility(client) {
  for (const table of ['auth.users', 'storage.buckets', 'storage.objects']) {
    requireThat((await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [table])).rows[0]?.present,
      'MANAGED_TABLE_MISSING');
  }
  const extension = await client.query(`SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE n.nspname IN ('app_private','drizzle') LIMIT 1`);
  requireThat(extension.rows.length === 0, 'EXTENSION_IN_RESET_SCHEMA');
  const cron = (await client.query("SELECT to_regclass('cron.job') IS NOT NULL AS present")).rows[0];
  if (cron?.present) {
    requireThat((await client.query('SELECT count(*)::integer AS count FROM cron.job WHERE active')).rows[0]?.count === 0,
      'ACTIVE_DATABASE_CRON_MUST_BE_PAUSED');
  }
  // Do not guess how to reset object classes the application's migrations do not use.
  const unsupported = await client.query(`SELECT count(*)::integer AS count FROM (
    SELECT 'pg_operator'::regclass AS classid,oid FROM pg_operator WHERE oprnamespace='public'::regnamespace
    UNION ALL SELECT 'pg_opclass'::regclass,oid FROM pg_opclass WHERE opcnamespace='public'::regnamespace
    UNION ALL SELECT 'pg_opfamily'::regclass,oid FROM pg_opfamily WHERE opfnamespace='public'::regnamespace
    UNION ALL SELECT 'pg_type'::regclass,oid FROM pg_type WHERE typnamespace='public'::regnamespace
      AND typtype='b' AND typelem=0
  ) x WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid=x.classid AND d.objid=x.oid
    AND d.refclassid='pg_extension'::regclass AND d.deptype='e')`);
  requireThat(unsupported.rows[0]?.count === 0, 'UNSUPPORTED_APPLICATION_CATALOG_OBJECTS');
}

/** Retain public itself (including provider ACL/default ACLs and extension members).
 * No SQL deletion of auth users, storage objects, buckets or provider schemas.
 * Re-read catalog entries during deletion: CASCADE can remove later candidates.
 */
export const CLEAR_APPLICATION_SQL = `
DO $rebuild$
DECLARE r record; iterations integer := 0;
BEGIN
  LOOP
    SELECT p.prokind,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS identity
      INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d
        WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e')
      ORDER BY p.oid LIMIT 1;
    EXIT WHEN NOT FOUND;
    iterations := iterations + 1;
    IF iterations > 10000 THEN RAISE EXCEPTION 'REBUILD_OBJECT_LIMIT'; END IF;
    EXECUTE 'DROP ' || CASE r.prokind WHEN 'p' THEN 'PROCEDURE ' WHEN 'a' THEN 'AGGREGATE ' ELSE 'FUNCTION ' END
      || r.identity || ' CASCADE';
  END LOOP;
  LOOP
    SELECT c.relkind,n.nspname,c.relname INTO r FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid
        AND d.refclassid='pg_extension'::regclass AND d.deptype='e') ORDER BY c.oid LIMIT 1;
    EXIT WHEN NOT FOUND;
    iterations := iterations + 1;
    IF iterations > 10000 THEN RAISE EXCEPTION 'REBUILD_OBJECT_LIMIT'; END IF;
    EXECUTE 'DROP ' || CASE r.relkind WHEN 'v' THEN 'VIEW ' WHEN 'm' THEN 'MATERIALIZED VIEW '
      WHEN 'S' THEN 'SEQUENCE ' WHEN 'f' THEN 'FOREIGN TABLE ' ELSE 'TABLE ' END
      || format('%I.%I',r.nspname,r.relname) || ' CASCADE';
  END LOOP;
  LOOP
    SELECT t.typtype,n.nspname,t.typname INTO r FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typtype IN ('e','d','c')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid
        AND d.refclassid='pg_extension'::regclass AND d.deptype='e') ORDER BY t.oid LIMIT 1;
    EXIT WHEN NOT FOUND;
    iterations := iterations + 1;
    IF iterations > 10000 THEN RAISE EXCEPTION 'REBUILD_OBJECT_LIMIT'; END IF;
    EXECUTE 'DROP ' || CASE r.typtype WHEN 'd' THEN 'DOMAIN ' ELSE 'TYPE ' END
      || format('%I.%I',r.nspname,r.typname) || ' CASCADE';
  END LOOP;
  FOR r IN SELECT p.polname,c.relname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname IN ('objects','buckets')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.%I',r.polname,r.relname);
  END LOOP;
END $rebuild$;
DROP SCHEMA IF EXISTS app_private CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;`;

export async function clearApplicationSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='180s'");
    const locked = (await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('fieldgrid:database-migrations:v1',0)) AS locked")).rows[0];
    requireThat(locked?.locked, 'MIGRATION_ALREADY_RUNNING');
    await inspectResetCompatibility(client);
    const before = await protectedCatalog(client);
    await client.query(CLEAR_APPLICATION_SQL);
    requireThat(await protectedCatalog(client) === before, 'MANAGED_CATALOG_CHANGED_RESET_ROLLED_BACK');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
const digest = value => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');
async function boundedRead(path) {
  const info = await lstat(path);
  requireThat(info.isFile() && !info.isSymbolicLink() && info.size <= 16 * 1024 * 1024, 'MIGRATION_FILE_INVALID');
  return readFile(path, 'utf8');
}
export async function migrationManifest(root) {
  const folder = join(root, 'lib/db/migrations');
  const entries = (await readdir(folder)).filter(name => /^\d+[a-zA-Z0-9_.-]*\.sql$/.test(name)).sort((a,b) => a.localeCompare(b));
  requireThat(entries.length > 0 && entries.length <= 2000, 'MIGRATION_MANIFEST_INVALID');
  const sql = [];
  for (const name of entries) sql.push({ name, hash: digest(await boundedRead(join(folder,name))) });
  const journal = JSON.parse(await boundedRead(join(folder,'generated/meta/_journal.json')));
  requireThat(Array.isArray(journal.entries) && journal.entries.length > 0, 'DRIZZLE_MANIFEST_INVALID');
  const drizzle = [];
  for (const entry of journal.entries) {
    requireThat(/^[a-zA-Z0-9_-]+$/.test(entry.tag) && Number.isSafeInteger(entry.when), 'DRIZZLE_ENTRY_INVALID');
    drizzle.push({ created_at: String(entry.when), hash: digest(await boundedRead(join(folder,'generated',`${entry.tag}.sql`))) });
  }
  return { sql, drizzle };
}
export async function verifyJournal(client, manifest) {
  const sql = (await client.query('SELECT name,hash FROM drizzle.veele_sql_migrations ORDER BY name')).rows;
  const generated = (await client.query('SELECT created_at::text,hash FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
  const equal = (a,b) => JSON.stringify(a.map(row => JSON.stringify(row)).sort()) === JSON.stringify(b.map(row => JSON.stringify(row)).sort());
  requireThat(equal(sql,manifest.sql) && equal(generated,manifest.drizzle), 'MIGRATION_JOURNAL_MISMATCH');
}

export async function seedApplication(client, owners, copyRoles) {
  requireThat(UUID.test(owners.platform) && UUID.test(owners.tenant) && owners.platform !== owners.tenant, 'OWNER_IDS_INVALID');
  await client.query('BEGIN');
  try {
    // The current migration chain seeds the canonical Veele tenant at this ID.
    // Domain seeds in historical migrations are production-shaped: never expose them on staging.
    await client.query('DELETE FROM public.tenant_domains');
    await client.query(`INSERT INTO public.tenants(id,slug,name,status,is_active,plan_key)
      VALUES ($1,'veele','Veele Services — staging','active',true,'starter')
      ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,status='active',is_active=true`, [TENANT_ID]);
    await client.query('DELETE FROM public.tenants WHERE id<>$1', [TENANT_ID]);
    await client.query(`INSERT INTO public.organization_settings(tenant_id,naam,smtp_enabled)
      VALUES ($1,'Veele Services — staging',false) ON CONFLICT(tenant_id) DO UPDATE SET smtp_enabled=false`, [TENANT_ID]);
    await client.query(`INSERT INTO public.tenant_domains(tenant_id,domain,type,is_primary,verification_status,verified_at)
      VALUES ($1,$2,'fieldgrid_subdomain',true,'verified',now()),
      ($1,'platform-staging.fieldgrid.nl','platform_reserved',false,'verified',now())`, [TENANT_ID,DOMAIN]);
    await copyRoles(client,TENANT_ID);
    await client.query(`INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'owner','active')`, [owners.platform]);
    await client.query(`INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES ($1,$2,'owner','active')`, [TENANT_ID,owners.tenant]);
    const grant = await client.query(`INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id)
      SELECT $1,$2,id FROM public.tenant_roles WHERE tenant_id=$1 AND name='Management' AND is_system AND NOT is_custom
      RETURNING tenant_role_id`, [TENANT_ID,owners.tenant]);
    requireThat(grant.rowCount === 1, 'MANAGEMENT_ROLE_MISSING');
    await client.query(`INSERT INTO public.tenant_modules(tenant_id,module_id,is_enabled,source)
      SELECT $1,id,true,'system' FROM public.modules WHERE is_enabled_by_default ON CONFLICT DO NOTHING`, [TENANT_ID]);
    await client.query(`INSERT INTO public.tenant_sectors(tenant_id,sector_id,is_enabled)
      SELECT $1,id,true FROM public.sectors ON CONFLICT DO NOTHING`, [TENANT_ID]);
    await client.query(`INSERT INTO public.tenant_sector_settings(tenant_id,mode,max_sectors,default_sector_id,enforce_sector_scope)
      VALUES ($1,'multi',NULL,(SELECT id FROM public.sectors ORDER BY id LIMIT 1),true)
      ON CONFLICT(tenant_id) DO UPDATE SET mode='multi',enforce_sector_scope=true`, [TENANT_ID]);
    await client.query(`INSERT INTO public.tenant_subscriptions(tenant_id,plan_id,status,source,created_by,current_period_starts_at)
      SELECT $1,id,'trial','manual',$2,now() FROM public.plans WHERE key='starter' AND is_active
      AND NOT EXISTS(SELECT 1 FROM public.tenant_subscriptions WHERE tenant_id=$1)`, [TENANT_ID,owners.platform]);
    await client.query(`INSERT INTO public.tenant_first_run_state(tenant_id,status,required_steps,completed_steps)
      VALUES ($1,'pending','["branding","users","sectors","modules"]'::jsonb,'[]'::jsonb)
      ON CONFLICT(tenant_id) DO NOTHING`, [TENANT_ID]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}

export async function verifyApplication(client, owners, canonical) {
  for (const table of ['customers','personnel','objects','assignments','payments','invoices']) {
    requireThat((await client.query(`SELECT count(*)::integer AS count FROM public.${table}`)).rows[0]?.count === 0,
      'OPERATIONAL_DATA_NOT_EMPTY');
  }
  const tenants = (await client.query('SELECT id FROM public.tenants')).rows;
  requireThat(tenants.length === 1 && tenants[0].id === TENANT_ID, 'CANONICAL_TENANT_INVALID');
  const domains = (await client.query('SELECT domain FROM public.tenant_domains ORDER BY domain')).rows.map(row => row.domain);
  requireThat(JSON.stringify(domains) === JSON.stringify(['platform-staging.fieldgrid.nl',DOMAIN].sort()), 'STAGING_DOMAINS_INVALID');
  const rls = (await client.query(`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace
    AND relname=ANY($1::text[])`, [['tenants','tenant_users','platform_users','customers','personnel','objects','assignments']])).rows;
  requireThat(rls.length === 7 && rls.every(row => row.relrowsecurity), 'TENANT_RLS_MISSING');
  requireThat((await client.query('SELECT count(*)::integer AS count FROM public.tenant_users WHERE user_id=$1', [owners.platform])).rows[0].count === 0,
    'CROSS_PORTAL_OWNER_BINDING');
  requireThat((await client.query('SELECT count(*)::integer AS count FROM public.platform_users WHERE user_id=$1', [owners.tenant])).rows[0].count === 0,
    'CROSS_PORTAL_OWNER_BINDING');
  requireThat((await client.query("SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime'")).rowCount === 1, 'REALTIME_PUBLICATION_MISSING');
  requireThat((await client.query(`SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename='portal_realtime_events'`)).rowCount === 1, 'REALTIME_MEMBERSHIP_MISSING');
  requireThat((await client.query(`SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LIMIT 1`)).rowCount === 1,
    'STORAGE_POLICIES_MISSING');
  requireThat((await client.query(`SELECT 1 FROM public.tenant_subscriptions WHERE tenant_id=$1 AND status='trial'`,[TENANT_ID])).rowCount === 1,
    'TENANT_SUBSCRIPTION_MISSING');
  // Use the canonical application role/fixture helpers, but roll every probe row back.
  const context = { tenantId: TENANT_ID, adminId: owners.tenant, operationId: randomUUID() };
  await client.query('BEGIN');
  try {
    const fixture = await canonical.bootstrapCanonical(client,context);
    await canonical.verifyCanonical(client,context);
    const claims = JSON.stringify({sub: owners.tenant,role:'authenticated'});
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [owners.tenant,claims]);
    await client.query('SET LOCAL ROLE authenticated');
    for (const [table,ids] of [['customers',fixture.customers],['objects',fixture.objects],['assignments',fixture.assignments]]) {
      const visible = (await client.query(`SELECT id FROM public.${table} WHERE id=ANY($1::uuid[])`, [ids])).rows;
      requireThat(visible.length === 1 && visible[0].id === ids[0], 'TENANT_ISOLATION_FAILED');
    }
    await client.query('SAVEPOINT denied_write');
    let denied = false;
    try { await client.query(`INSERT INTO public.customers(tenant_id,name,contact_email,is_active)
      VALUES ($1,'Rebuild isolation probe','probe@example.invalid',true)`, [fixture.isolationId]); }
    catch(error) { denied = ['42501','23514'].includes(error.code); }
    await client.query('ROLLBACK TO SAVEPOINT denied_write');
    requireThat(denied, 'CROSS_TENANT_WRITE_NOT_DENIED');
  } finally {
    await client.query('ROLLBACK');
  }
}
