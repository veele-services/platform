import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROJECT, REPOSITORY, WORKFLOW, VALIDATION_WORKFLOW, confirmation, validateConfig, migrationEnv,
  assertHealthUrl, runRebuild, newReport, RebuildError } from '../scripts/staging-rebuild/contract.mjs';
import { classifyValidation, waitForValidation } from '../scripts/staging-rebuild/ci.mjs';
import { protectedCatalog, clearApplicationSchema, migrationManifest, verifyJournal, CLEAR_APPLICATION_SQL } from '../scripts/staging-rebuild/database.mjs';
import { stagingFetch,createProviders } from '../scripts/staging-rebuild/providers.mjs';
import { boundedCommand,checkHealth } from '../scripts/fieldgrid-disposable-staging-rebuild.mjs';

const SHA='a'.repeat(40);
function environment(mode='plan') {
  return {APP_ENV:'staging',TARGET_ENVIRONMENT:'staging',EXPECTED_SUPABASE_PROJECT_REF:PROJECT,
    GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPOSITORY,
    GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:`${REPOSITORY}/${WORKFLOW}@refs/heads/main`,
    EXPECTED_MAIN_SHA:SHA,GITHUB_SHA:SHA,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
    REBUILD_MODE:mode,REBUILD_CONFIRMATION:confirmation(SHA),REBUILD_MAINTENANCE_CONFIRMED:'true',
    NEXT_PUBLIC_SUPABASE_URL:`https://${PROJECT}.supabase.co`,FIELDGRID_DATABASE_CONNECTION_PURPOSE:'migration',
    DB_SSL:'true',DB_SSL_REJECT_UNAUTHORIZED:'true',PGSSLMODE:'verify-full',
    DATABASE_URL:`postgresql://fieldgrid_runtime_app.${PROJECT}:runtime-password@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
    FIELDGRID_MIGRATION_DATABASE_URL:`postgresql://postgres.${PROJECT}:migration-password@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
    SUPABASE_SERVICE_ROLE_KEY:'fake-service-key-not-a-secret',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fake-anon-key-not-a-secret',GITHUB_TOKEN:'fake-gh-token-not-a-secret',
    FIELDGRID_REBUILD_PLATFORM_EMAIL:'platform@example.invalid',FIELDGRID_REBUILD_PLATFORM_PASSWORD:'fake-platform-password-long-enough',
    FIELDGRID_REBUILD_TENANT_EMAIL:'tenant@example.invalid',FIELDGRID_REBUILD_TENANT_PASSWORD:'fake-tenant-password-long-enough',
    BACKOFFICE_PUBLIC_HEALTH_URL:'https://veele.staging.fieldgrid.nl/api/health',
    PERSONEEL_PUBLIC_HEALTH_URL:'https://personeel.staging.fieldgrid.nl/api/health',
    KLANT_PUBLIC_HEALTH_URL:'https://klant.staging.fieldgrid.nl/api/health',API_PUBLIC_HEALTH_URL:'https://api.staging.fieldgrid.nl/health',
    FIELDGRID_DATABASE_SSL_ROOT_CERT:'/fake-public-cert.pem',PATH:process.env.PATH,HOME:tmpdir()};
}
test('plan and explicitly confirmed apply accept only the designated staging project',()=>{
  assert.equal(validateConfig(environment()).mode,'plan');assert.equal(validateConfig(environment('apply')).mode,'apply');
});
for(const [key,value] of Object.entries({APP_ENV:'production',TARGET_ENVIRONMENT:'production',EXPECTED_SUPABASE_PROJECT_REF:'otherproject',
  GITHUB_ACTIONS:'false',GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'other/platform',GITHUB_REF:'refs/heads/staging',
  GITHUB_WORKFLOW_REF:`${REPOSITORY}/wrong.yml@refs/heads/main`,EXPECTED_MAIN_SHA:'b'.repeat(40),GITHUB_SHA:'b'.repeat(40),
  REBUILD_MODE:'reset',GITHUB_RUN_ID:'123;echo private',GITHUB_RUN_ATTEMPT:'0',REBUILD_CONFIRMATION:'yes',
  REBUILD_MAINTENANCE_CONFIRMED:'false',NEXT_PUBLIC_SUPABASE_URL:'https://production.supabase.co',
  FIELDGRID_DATABASE_CONNECTION_PURPOSE:'runtime',DB_SSL:'false',DB_SSL_REJECT_UNAUTHORIZED:'false',PGSSLMODE:'disable',
  NODE_OPTIONS:'--require exploit.cjs',PGOPTIONS:'-c search_path=evil',NODE_TLS_REJECT_UNAUTHORIZED:'0',
  FIELDGRID_SQL_MIGRATION_MAX_NAME:'001.sql',PGSERVICE:'production',PGSERVICEFILE:'/tmp/service',
  FIELDGRID_REBUILD_PLATFORM_PASSWORD:'short',FIELDGRID_REBUILD_TENANT_EMAIL:'bad',NEXT_PUBLIC_SUPABASE_ANON_KEY:''})) {
  test(`rejects unsafe configuration: ${key}`,()=>assert.throws(()=>validateConfig({...environment('apply'),[key]:value}),RebuildError));
}
test('apply reruns require a new deliberate dispatch; plan reruns do not',()=>{
  assert.throws(()=>validateConfig({...environment('apply'),GITHUB_RUN_ATTEMPT:'2'}),/APPLY_REQUIRES_NEW_DISPATCH/);
  assert.equal(validateConfig({...environment(),GITHUB_RUN_ATTEMPT:'2'}).attempt,'2');
});
for(const endpoint of [
  `postgresql://postgres.${PROJECT}:p@evil.example:5432/postgres`,
  `postgresql://postgres.${PROJECT}:p@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.production:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${PROJECT}:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=disable`,
  `postgresql://postgres.${PROJECT}:p@aws-1-eu-central-1.pooler.supabase.com:5432/other`,
  `postgresql://postgres.${PROJECT}:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres#fragment`,
]) test('rejects database endpoint escape '+endpoint.replace(/:[^:@]+@/,':redacted@'),()=>{
  assert.throws(()=>validateConfig({...environment(),FIELDGRID_MIGRATION_DATABASE_URL:endpoint}),RebuildError);
});
test('owners must use separate identities and credentials',()=>{
  const env=environment();assert.throws(()=>validateConfig({...env,FIELDGRID_REBUILD_TENANT_EMAIL:env.FIELDGRID_REBUILD_PLATFORM_EMAIL}),/SEPARATE/);
  assert.throws(()=>validateConfig({...env,FIELDGRID_REBUILD_TENANT_PASSWORD:env.FIELDGRID_REBUILD_PLATFORM_PASSWORD}),/SEPARATE/);
});
for(const url of ['https://veele.fieldgrid.nl/api/health','http://staging.fieldgrid.nl/health','https://staging.fieldgrid.nl.evil/health',
  'https://user:password@staging.fieldgrid.nl/health','https://staging.fieldgrid.nl:8443/health','https://staging.fieldgrid.nl/health?key=private']) {
  test('health probes cannot escape staging: '+url,()=>assert.throws(()=>assertHealthUrl(url),/HEALTH_URL_INVALID/));
}
test('migration children cannot inherit credentials, NODE_OPTIONS or a migration cutoff',()=>{
  const env=environment();const clean=migrationEnv(validateConfig(env),{...env,NODE_OPTIONS:'bad',FIELDGRID_SQL_MIGRATION_MAX_NAME:'001',MOLLIE_API_KEY:'private'});
  for(const key of ['NODE_OPTIONS','FIELDGRID_SQL_MIGRATION_MAX_NAME','GITHUB_TOKEN','MOLLIE_API_KEY','SUPABASE_SERVICE_ROLE_KEY','FIELDGRID_REBUILD_PLATFORM_PASSWORD']) assert.equal(clean[key],undefined);
  assert.equal(clean.FIELDGRID_RUNTIME_ENV_FILE_MODE,'disabled');assert.equal(clean.FIELDGRID_DATABASE_CONNECTION_PURPOSE,'migration');
});
function fakeAdapter(failAt) {
  const calls=[],snapshots=[]; const adapter={persist:async report=>snapshots.push(structuredClone(report))};
  for(const method of ['source','inspectDatabase','inspectProviders','inventoryWriters','checkBootstrap','stopWriters','assertStopped',
    'clearStorage','clearSchema','clearAuth','migrate','verifyJournal','seedCatalogs','seedOwners','verifyDatabase','verifyProviders',
    'startWriters','holdWriters','verifyHealth','preflightHealth']) adapter[method]=async()=>{
      calls.push(method);if(method===failAt)throw new RebuildError('TEST_FAILURE');
      if(method==='inventoryWriters')return [{unit:'veele-staging.service',active:true}];
    };
  return {adapter,calls,snapshots};
}
test('plan performs zero destructive operations',async()=>{
  const config=validateConfig(environment()),fake=fakeAdapter();const report=await runRebuild(config,fake.adapter,newReport(config));
  assert.equal(report.status,'planned');assert.equal(report.destructiveChangesStarted,false);
  assert.deepEqual(fake.calls,['source','inspectDatabase','inspectProviders','inventoryWriters','checkBootstrap','preflightHealth']);
});
test('apply follows the full reset/migrate/bootstrap/verify path without any backup or rehearsal gate',async()=>{
  const config=validateConfig(environment('apply')),fake=fakeAdapter();const report=await runRebuild(config,fake.adapter,newReport(config));
  assert.equal(report.status,'rebuilt');assert.equal(report.applicationHealthVerified,true);assert.equal(report.writersHeld,false);
  assert.ok(fake.calls.indexOf('clearSchema')<fake.calls.indexOf('migrate'));
  assert.ok(fake.calls.indexOf('verifyDatabase')<fake.calls.indexOf('startWriters'));
  assert.ok(fake.snapshots.find(r=>r.destructiveChangesStarted && !r.checks.some(c=>c.id==='storage.clear')));
  assert.ok(!JSON.stringify(report).includes(environment().FIELDGRID_REBUILD_PLATFORM_PASSWORD));
});
for(const method of ['source','inspectDatabase','inspectProviders','inventoryWriters','checkBootstrap','preflightHealth']) {
  test('preflight failure never mutates: '+method,async()=>{
    const config=validateConfig(environment('apply')),fake=fakeAdapter(method);const report=await runRebuild(config,fake.adapter,newReport(config));
    assert.equal(report.status,'preflight_failed');assert.equal(report.destructiveChangesStarted,false);
    assert.ok(!fake.calls.includes('clearStorage'));assert.ok(!fake.calls.includes('clearSchema'));
  });
}
for(const method of ['clearStorage','clearSchema','clearAuth','migrate','verifyJournal','seedCatalogs','seedOwners','verifyDatabase','verifyProviders','startWriters','verifyHealth']) {
  test('failure leaves writers held instead of restoring old data: '+method,async()=>{
    const config=validateConfig(environment('apply')),fake=fakeAdapter(method);const report=await runRebuild(config,fake.adapter,newReport(config));
    assert.equal(report.status,'rebuild_failed_writers_held');assert.equal(report.writersHeld,true);assert.ok(fake.calls.includes('holdWriters'));
    if(!['startWriters','verifyHealth'].includes(method))assert.ok(!fake.calls.includes('startWriters'));
    assert.equal(report.databaseRebuilt,false);
  });
}
test('uncertain stop outcome is never reported as held',async()=>{
  const config=validateConfig(environment('apply')),fake=fakeAdapter('migrate');fake.adapter.holdWriters=async()=>{throw new Error('private');};
  const report=await runRebuild(config,fake.adapter,newReport(config));assert.equal(report.writersHeld,null);assert.equal(report.errorCode,'WRITER_HOLD_UNCONFIRMED');
});
const successRun=path=>({path,event:'push',head_sha:SHA,head_branch:'main',run_number:1,status:'completed',conclusion:'success'});
const goodRuns=()=>['.github/workflows/main-exact-head-validation.yml',VALIDATION_WORKFLOW].map(successRun);
test('both exact-main validations must pass; PR success alone is insufficient',()=>{
  assert.equal(classifyValidation(goodRuns(),SHA),true);assert.equal(classifyValidation(goodRuns().map(r=>({...r,event:'pull_request'})),SHA),false);
  assert.equal(classifyValidation(goodRuns().map(r=>({...r,head_sha:'b'.repeat(40)})),SHA),false);
  assert.equal(classifyValidation([goodRuns()[0]],SHA),false);
  assert.throws(()=>classifyValidation([goodRuns()[0],{...goodRuns()[1],conclusion:'failure'}],SHA),/VALIDATION_FAILED/);
});
test('bounded CI wait retries pending evidence without weakening the SHA gate',async()=>{
  let clock=0,requests=0;await waitForValidation(SHA,'fake',{now:()=>clock,sleep:async ms=>{clock+=ms;},fetcher:async url=>({ok:true,json:async()=>{
    if(url.includes('git/ref'))return {object:{sha:SHA}};
    requests++;return {total_count:2,workflow_runs:requests===1?[]:goodRuns()};
  }})});assert.equal(requests,2);
});
test('main moving while waiting stops immediately',async()=>{
  await assert.rejects(waitForValidation(SHA,'fake',{fetcher:async()=>({ok:true,json:async()=>({object:{sha:'b'.repeat(40)}})})}),/MAIN_MOVED/);
});
test('CI waiting times out rather than authorizing an untested SHA',async()=>{
  let clock=0;await assert.rejects(waitForValidation(SHA,'fake',{timeout:1,now:()=>clock,sleep:async()=>{clock=10;},fetcher:async url=>({ok:true,json:async()=>url.includes('git/ref')?{object:{sha:SHA}}:{total_count:0,workflow_runs:[]}})}),/CI_STILL_PENDING/);
});
test('provider fetch forbids redirects and origin escapes',async()=>{
  const origin=`https://${PROJECT}.supabase.co`;let options;
  const guarded=stagingFetch(origin,async(_,given)=>{options=given;return 'ok';});
  assert.equal(await guarded(`${origin}/auth/v1/admin/users`,{redirect:'follow'}),'ok');assert.equal(options.redirect,'error');
  assert.throws(()=>guarded('https://evil.invalid/auth'),/ORIGIN_ESCAPE/);
});
function databaseFake(changeProof=false) {
  const calls=[];let proofCount=0;
  const client={query:async(sql)=>{
    calls.push(sql);
    if(sql.includes('AS locked'))return {rows:[{locked:true}]};
    if(sql.includes('AS proof'))return {rows:[{proof:{id:changeProof?proofCount++:0}}]};
    if(sql.includes('to_regclass'))return {rows:[{present:!sql.includes('cron.job')}]};
    if(sql.includes('pg_extension e JOIN'))return {rows:[]};
    if(sql.includes('AS count'))return {rows:[{count:0}]};
    return {rows:[]};
  }};
  return {client,calls};
}
test('schema cleanup commits only when provider infrastructure is unchanged',async()=>{
  const fake=databaseFake();await clearApplicationSchema(fake.client);
  assert.equal(fake.calls[0],'BEGIN');assert.equal(fake.calls.at(-1),'COMMIT');assert.ok(fake.calls.includes(CLEAR_APPLICATION_SQL));
});
test('provider object loss rolls the schema cleanup back',async()=>{
  const fake=databaseFake(true);await assert.rejects(clearApplicationSchema(fake.client),/MANAGED_CATALOG_CHANGED/);
  assert.equal(fake.calls.at(-1),'ROLLBACK');assert.ok(!fake.calls.includes('COMMIT'));
});
test('schema reset never wipes managed rows or drops the public/provider schemas',()=>{
  assert.doesNotMatch(CLEAR_APPLICATION_SQL,/DROP\s+SCHEMA\s+(?:IF EXISTS\s+)?(?:public|auth|storage|realtime)\b/i);
  assert.doesNotMatch(CLEAR_APPLICATION_SQL,/(?:DELETE FROM|TRUNCATE)\s+(?:auth|storage)\./i);
  assert.match(CLEAR_APPLICATION_SQL,/DROP POLICY/);assert.match(CLEAR_APPLICATION_SQL,/pg_extension/);
});
test('migration manifest and journal verify names and hashes, not row counts alone',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rebuild-manifest-'));
  try {
    await mkdir(join(root,'lib/db/migrations/generated/meta'),{recursive:true});
    await writeFile(join(root,'lib/db/migrations/001_test.sql'),'SELECT 1;\n');
    await writeFile(join(root,'lib/db/migrations/generated/0000_base.sql'),'SELECT 2;\n');
    await writeFile(join(root,'lib/db/migrations/generated/meta/_journal.json'),JSON.stringify({entries:[{tag:'0000_base',when:123}]}));
    const manifest=await migrationManifest(root);assert.equal(manifest.sql.length,1);
    await verifyJournal({query:async sql=>({rows:sql.includes('veele_sql')?manifest.sql:manifest.drizzle})},manifest);
    await assert.rejects(verifyJournal({query:async sql=>({rows:sql.includes('veele_sql')?[{...manifest.sql[0],hash:'wrong'}]:manifest.drizzle})},manifest),/JOURNAL_MISMATCH/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('subprocess failure output is reduced to a safe code',async()=>{
  await assert.rejects(boundedCommand(process.execPath,['-e',"console.error('secret password abc');process.exit(1)"],{PATH:process.env.PATH},{timeout:1000,code:'TEST_COMMAND'}),error=>error.message==='TEST_COMMAND');
});
test('runtime env opt-out prevents an ancestor file from reintroducing overrides',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rebuild-env-'));
  try {
    await writeFile(join(dir,'.env'),'FIELDGRID_SQL_MIGRATION_MAX_NAME=001_test.sql\n');
    const module=new URL('../lib/db/src/runtime-env.ts',import.meta.url).href;
    const program=`import {loadDbRuntimeEnv} from ${JSON.stringify(module)};loadDbRuntimeEnv();process.stdout.write(process.env.FIELDGRID_SQL_MIGRATION_MAX_NAME??'absent');`;
    const args=[...process.execArgv.filter(x=>x==='--experimental-strip-types'),'--input-type=module','-e',program];
    assert.equal(execFileSync(process.execPath,args,{cwd:dir,env:{PATH:process.env.PATH,FIELDGRID_RUNTIME_ENV_FILE_MODE:'disabled'},encoding:'utf8'}),'absent');
    assert.equal(execFileSync(process.execPath,args,{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'}),'001_test.sql');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('healthz checks require staging service and release identity, not merely HTTP 200',async()=>{
  assert.equal(assertHealthUrl('https://veele.staging.fieldgrid.nl/healthz'),'https://veele.staging.fieldgrid.nl/healthz');
  const endpoint=[{surface:'backoffice',url:'https://veele.staging.fieldgrid.nl/healthz'}];
  const response=(environment='staging',service='backoffice',release=SHA)=>new Response(JSON.stringify({status:'ok'}),{headers:{'content-type':'application/json','x-fieldgrid-environment':environment,'x-fieldgrid-service':service,'x-fieldgrid-release':release}});
  assert.deepEqual(await checkHealth(endpoint,async()=>response(),{},{attempts:1}),{backoffice:SHA});
  for(const args of [['production'],['staging','api'],['staging','backoffice','unknown']]) {
    await assert.rejects(checkHealth(endpoint,async()=>response(...args),{},{attempts:1}),/HEALTH_BACKOFFICE_FAILED/);
  }
  await assert.rejects(checkHealth(endpoint,async()=>response(),{backoffice:'b'.repeat(40)},{attempts:1}),/HEALTH_BACKOFFICE_FAILED/);
});

test('recovery is explicit and records unavailable pre-start health instead of claiming a pass',async()=>{
  const config=validateConfig({...environment('apply'),REBUILD_RECOVERY:'true'});
  assert.equal(config.recovery,true);assert.equal(validateConfig(environment()).recovery,false);
  const fake=fakeAdapter();fake.adapter.preflightHealth=async()=>({notApplicable:true,code:'HELD_WRITERS_RECOVERY'});
  const report=await runRebuild(config,fake.adapter,newReport(config));
  assert.equal(report.checks.find(c=>c.id==='preflight.application_health').status,'NOT_APPLICABLE');
  assert.equal(report.applicationHealthVerified,true);assert.ok(fake.calls.includes('verifyHealth'));
  assert.throws(()=>validateConfig({...environment(),REBUILD_RECOVERY:'anything'}),/RECOVERY_MODE_INVALID/);
});
test('workflow has a manual staging-only boundary and separate real two-cycle CI',async()=>{
  const live=await readFile(new URL('../.github/workflows/fieldgrid-disposable-staging-rebuild.yml',import.meta.url),'utf8');
  assert.match(live,/workflow_dispatch:/);assert.doesNotMatch(live,/^  (push|pull_request|schedule):/m);
  for(const required of ['environment: staging','group: veele-staging','persist-credentials: false','GITHUB_RUN_ATTEMPT','maintenance_confirmed','recover_failed_rebuild'])assert.ok(live.includes(required));
  assert.doesNotMatch(live,/MOLLIE_API_KEY|contents: write|actions: write|fieldgrid-wp1-copy-sandbox|backupAndRehearse/);
  const ci=await readFile(new URL('../.github/workflows/fieldgrid-disposable-staging-rebuild-validation.yml',import.meta.url),'utf8');
  assert.match(ci,/postgres:17/);assert.match(ci,/fieldgrid-disposable-staging-rebuild-ci.mjs/);assert.doesNotMatch(ci,/secrets\./);
  const runtime=await readFile(new URL('../scripts/fieldgrid-disposable-staging-rebuild-ci.mjs',import.meta.url),'utf8');
  for(const proof of ['cycle<=2','127.0.0.1','clearApplicationSchema(client)','verifyJournal(client,manifest)','verifyApplication(client,owners,canonical)'])assert.ok(runtime.includes(proof));
});

function providerFixture() {
  const calls=[];let ids=['10000000-0000-4000-8000-000000000001'];
  const admin={auth:{admin:{listUsers:async()=>({data:{users:ids.map(id=>({id}))}}),
    deleteUser:async(id,soft)=>{calls.push(['deleteUser',id,soft]);ids=ids.filter(value=>value!==id);return {data:{}};}}},
    storage:{listBuckets:async()=>({data:[{id:'documents'}]}),emptyBucket:async id=>{calls.push(['emptyBucket',id]);return {data:{}};}}};
  const client={query:async sql=>({rows:sql.includes('count(*)')?[{count:ids.length}]:sql.includes('auth.users')?ids.map(id=>({id})):[{id:'documents'}]})};
  const providers=createProviders(validateConfig(environment()),{service:'fake',anon:'fake'},()=>admin,client);
  return {providers,calls,admin,addUser:()=>ids.push('10000000-0000-4000-8000-000000000002')};
}
test('provider reset deletes users only through the hard-delete API after matching inventory',async()=>{
  const f=providerFixture();await f.providers.inspect();await f.providers.clearAuth();
  assert.deepEqual(f.calls,[['deleteUser','10000000-0000-4000-8000-000000000001',false]]);
});
test('concurrent signup blocks provider deletion rather than expanding the authorized set',async()=>{
  const f=providerFixture();await f.providers.inspect();f.addUser();
  await assert.rejects(f.providers.clearAuth(),/AUTH_INVENTORY_DRIFT/);assert.deepEqual(f.calls,[]);
});
test('storage API rejection stops the destructive sequence with a redacted code',async()=>{
  const f=providerFixture();await f.providers.inspect();
  f.admin.storage.emptyBucket=async()=>({error:{message:'do not publish this provider detail'}});
  await assert.rejects(f.providers.clearStorage(),error=>error.message==='STORAGE_EMPTY_FAILED');
  assert.deepEqual(f.calls,[]);
});
