#!/usr/bin/env node
/** Loopback-only runtime proof. NEVER import this file from a live entrypoint. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { clearApplicationSchema, migrationManifest, verifyJournal, seedApplication, verifyApplication } from './staging-rebuild/database.mjs';
import { boundedCommand } from './fieldgrid-disposable-staging-rebuild.mjs';
import * as canonical from './wp1/bootstrap.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'artifacts/disposable-staging-rebuild-ci');
let phase='local.guard',client;
const report={contract:'disposable-staging-rebuild-ci-v1',status:'failed',cycles:0,
  providerApisExercised:false,localProviderShims:true};
try {
  assert.equal(Number(process.versions.node.split('.')[0]),24);
  assert.equal(process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET,'1');
  const url=new URL(process.env.DATABASE_URL);
  assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.port,'5432');assert.equal(url.pathname,'/fieldgrid_runtime_safety');
  assert.equal(url.username,'postgres');assert.equal(url.password,'postgres');
  assert.equal(url.search,'');assert.equal(url.hash,'');
  assert.ok(!process.env.FIELDGRID_MIGRATION_DATABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY);
  const require=createRequire(new URL('../lib/db/package.json',import.meta.url));
  const {Client}=require('pg');client=new Client({connectionString:url.href,ssl:false});await client.connect();
  const identity=(await client.query('SELECT current_database() AS name,current_user AS username')).rows[0];
  assert.deepEqual(identity,{name:'fieldgrid_runtime_safety',username:'postgres'});
  const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',CI:'true',
    DATABASE_URL:url.href,DB_SSL:'false',PGSSLMODE:'disable',FIELDGRID_RUNTIME_ENV_FILE_MODE:'disabled'};
  const manifest=await migrationManifest(root);
  for(let cycle=1;cycle<=2;cycle++) {
    phase=`cycle.${cycle}.sentinel`;
    const id=randomUUID();const bucket=`ci-rebuild-${cycle}`;
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)",[id,`${id}@example.invalid`]);
    await client.query('INSERT INTO storage.buckets(id,name) VALUES ($1,$1)',[bucket]);
    await client.query("INSERT INTO storage.objects(bucket_id,name) VALUES ($1,'sentinel.txt')",[bucket]);
    // Exercise the SAME hosted application-schema reset. Provider data must survive its SQL path.
    phase=`cycle.${cycle}.clear`;await clearApplicationSchema(client);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM auth.users WHERE id=$1',[id])).rows[0].count,1);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id=$1',[bucket])).rows[0].count,1);
    assert.equal((await client.query("SELECT to_regclass('public.tenants') AS relation")).rows[0].relation,null);
    assert.equal((await client.query("SELECT to_regclass('drizzle.veele_sql_migrations') AS relation")).rows[0].relation,null);
    // LOCAL SHIMS ONLY: simulate the Auth/Storage APIs; there are no provider services in this job.
    await client.query('DELETE FROM storage.objects; DELETE FROM storage.buckets; DELETE FROM auth.users');
    phase=`cycle.${cycle}.migrate`;
    await boundedCommand('pnpm',['--filter','@workspace/db','run','db:migrate'],env,{code:'CI_MIGRATION_FAILED'});
    await verifyJournal(client,manifest);
    // The existing runtime-safety harness installs these same local-only provider ACL shims.
    // They do not enter the live reset path; hosted ACLs are tested separately through authenticated APIs.
    await client.query(`GRANT SELECT ON public.personnel,public.roles,public.sectors,public.assignments,
      public.assignment_tasks,public.assignment_extra_work,public.assignment_photos,public.assignment_report_notes,
      public.assignment_report_note_attachments,public.assignment_material_usage,public.reports,
      public.objects,public.customers,public.customer_users TO authenticated`);
    phase=`cycle.${cycle}.catalogs`;
    for(const seed of ['seed:rbac','seed:sectors'])await boundedCommand('pnpm',['--filter','@workspace/db','run',seed],env,{code:'CI_CATALOG_FAILED'});
    const owners={platform:randomUUID(),tenant:randomUUID()};
    for(const [surface,owner] of Object.entries(owners))await client.query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data)
      VALUES ($1,$2,now(),$3::jsonb)`,[owner,`${surface}-${cycle}@example.invalid`,JSON.stringify({portal:surface==='platform'?'platform-admin':'backoffice'})]);
    phase=`cycle.${cycle}.bootstrap`;await seedApplication(client,owners,canonical.copyRoles);
    phase=`cycle.${cycle}.verify`;await verifyApplication(client,owners,canonical);
    // Real table state, real migrations and real RLS; transient fixtures must not persist.
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.customers')).rows[0].count,0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.tenants')).rows[0].count,1);
    report.cycles=cycle;
  }
  report.status='passed';
} catch(error) {
  report.failureStage=phase;
  report.errorCode=/^[A-Z][A-Z0-9_]{0,95}$/.test(error?.code??'')?error.code:'LOCAL_PROOF_FAILED';
  // This job only contains localhost fixtures and dummy credentials.
  console.error(error instanceof Error ? error.message : 'Local rebuild assertion failed');
  process.exitCode=1;
} finally {
  await client?.end().catch(()=>{});
  await mkdir(out,{recursive:true});
  await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Disposable rebuild CI: ${report.status}; ${report.cycles} verified cycles; stage=${phase}`);
}
