#!/usr/bin/env node
/** Manual staging workflow entrypoint. Importing it performs no I/O or mutation. */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile, rename, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, migrationEnv, newReport, runRebuild, PROJECT, RebuildError, requireThat, safeCode } from './staging-rebuild/contract.mjs';
import { waitForValidation } from './staging-rebuild/ci.mjs';
import { inspectDatabase, clearApplicationSchema, migrationManifest, verifyJournal, seedApplication, verifyApplication } from './staging-rebuild/database.mjs';
import { createProviders } from './staging-rebuild/providers.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT=join(ROOT,'artifacts/fieldgrid-disposable-staging-rebuild');
const children=new Set();
export function boundedCommand(binary,args,env,{timeout=15*60*1000,code='SUBPROCESS_FAILED',cwd=ROOT}={}) {
  return new Promise((resolvePromise,rejectPromise)=>{
    const child=spawn(binary,args,{cwd,env,shell:false,detached:true,stdio:['ignore','pipe','pipe']});
    children.add(child);
    let bytes=0, settled=false, text='';
    const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const finish=(error)=>{
      if(settled) return; settled=true; clearTimeout(timer); children.delete(child);
      if(error) rejectPromise(error); else resolvePromise();
    };
    const timer=setTimeout(()=>{kill();finish(new RebuildError(`${code}_TIMEOUT`));},timeout);
    const receive=chunk=>{
      bytes+=chunk.length;
      if(bytes>1024*1024){kill();finish(new RebuildError(`${code}_OUTPUT_LIMIT`));return;}
      // Raw output is kept only in bounded process memory, never printed or persisted.
      text+=chunk.toString();
    };
    child.stdout.on('data',receive);child.stderr.on('data',receive);
    child.on('error',()=>finish(new RebuildError(code)));
    child.on('close',status=>{
      if(status===0) finish();
      else {
        const sqlState=/\bcode:\s*['"]([0-9A-Z]{5})['"]/.exec(text)?.[1];
        finish(new RebuildError(sqlState?`${code}_SQLSTATE_${sqlState}`:code));
      }
      text='';
    });
  });
}
async function writeReport(report) {
  await mkdir(OUTPUT,{recursive:true,mode:0o700});
  const info=await lstat(OUTPUT);
  requireThat(info.isDirectory() && !info.isSymbolicLink(),'EVIDENCE_DIRECTORY_INVALID');
  const temporary=join(OUTPUT,`.result-${process.pid}.json`);
  await writeFile(temporary,`${JSON.stringify(report,null,2)}\n`,{mode:0o600,flag:'w'});
  await rename(temporary,join(OUTPUT,'result.json'));
}
export async function checkHealth(health, fetcher=fetch, expected={}, { attempts=30, sleep=ms=>new Promise(r=>setTimeout(r,ms)) }={}) {
  const releases={};
  const serviceNames={backoffice:'backoffice',personeel:'personnel',klant:'customer',api:'api'};
  for(const endpoint of health) {
    let healthy=false;
    for(let attempt=0;attempt<attempts;attempt++) {
      try {
        const response=await fetcher(endpoint.url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
        const release=response.headers.get('x-fieldgrid-release');
        if(response.status===200 && response.headers.get('content-type')?.includes('application/json') &&
          response.headers.get('x-fieldgrid-environment')==='staging' &&
          response.headers.get('x-fieldgrid-service')===serviceNames[endpoint.surface] && /^[a-f0-9]{40}$/.test(release??'') &&
          (!expected[endpoint.surface] || release===expected[endpoint.surface])) {
          const text=await response.text();
          requireThat(text.length<=8192,'HEALTH_RESPONSE_BOUND');
          const body=JSON.parse(text);
          healthy=body?.ok===true || ['ok','healthy','up'].includes(body?.status);
          if(body?.environment && body.environment!=='staging') healthy=false;
          if(healthy) {releases[endpoint.surface]=release;break;}
        }
      } catch { /* Do not log response bodies, tokens or deployment internals. */ }
      if(attempt+1<attempts) await sleep(1000);
    }
    requireThat(healthy,`HEALTH_${endpoint.surface.toUpperCase()}_FAILED`);
  }
  return releases;
}
export async function main(env=process.env) {
  let client,config,report,hold,shuttingDown=false;
  const stopOnSignal=async()=>{
    if(shuttingDown) return;
    shuttingDown=true;
    for(const child of children){try{process.kill(-child.pid,'SIGKILL');}catch{}}
    if(report?.destructiveChangesStarted){
      report.status='cancelled_writers_held';report.errorCode='REBUILD_CANCELLED';
      try{await hold?.();report.writersHeld=true;}catch{report.writersHeld=null;}
      await writeReport(report).catch(()=>{});
    }
    process.exit(1);
  };
  process.once('SIGTERM',stopOnSignal);process.once('SIGINT',stopOnSignal);
  try {
    requireThat(Number(process.versions.node.split('.')[0])===24,'NODE_24_REQUIRED');
    config=validateConfig(env); report=newReport(config); await writeReport(report);
    const checkCheckout=()=>{
      requireThat(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',timeout:10000}).trim()===config.sha,'CHECKOUT_MISMATCH');
      // Pin the destructive source; uncommitted code is not covered by exact-SHA CI.
      requireThat(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:ROOT,encoding:'utf8',timeout:10000}).trim()==='', 'CHECKOUT_DIRTY');
    };
    checkCheckout();
    const { databaseNodePostgresSslConfig }=await import('./fieldgrid-database-root-cert.mjs');
    const { createServiceControl,parseWriterUnits }=await import('./wp1/services.mjs');
    const canonical=await import('./wp1/bootstrap.mjs');
    const dbRequire=createRequire(new URL('../lib/db/package.json',import.meta.url));
    const webRequire=createRequire(new URL('../artifacts/backoffice/package.json',import.meta.url));
    const {Client}=dbRequire('pg'); const {createClient}=webRequire('@supabase/supabase-js');
    const units=parseWriterUnits(env.FIELDGRID_WP1_WRITER_UNITS);
    const core=new Set(['veele-staging.service','veele-staging-personeel.service','veele-staging-klant.service','veele-staging-api.service']);
    const childEnv=migrationEnv(config,env);
    const services=createServiceControl(units);
    const manifest=await migrationManifest(ROOT);
    let connected=false,owners,previous,activeReleases;
    client=new Client({connectionString:config.migration,ssl:databaseNodePostgresSslConfig(env),
      connectionTimeoutMillis:15000,query_timeout:180000,application_name:'fieldgrid-disposable-staging-rebuild',options:'-c timezone=UTC'});
    client.on('error',()=>{});
    const providers=createProviders(config,{service:env.SUPABASE_SERVICE_ROLE_KEY,anon:env.NEXT_PUBLIC_SUPABASE_ANON_KEY},createClient,client);
    const hostEnv={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'};
    hold=async()=>{
      let failed=false;
      for(const unit of [...units].sort((a,b)=>Number(b.endsWith('.timer'))-Number(a.endsWith('.timer')))) {
        try{await boundedCommand('/usr/bin/sudo',['-n','/usr/bin/systemctl','stop',unit],hostEnv,{timeout:30000,code:'WRITER_STOP_FAILED'});}
        catch{failed=true;}
      }
      requireThat(!failed,'WRITER_HOLD_UNCONFIRMED');await services.assertStopped();
    };
    const adapter={
      persist:async value=>{
        requireThat(!shuttingDown,'REBUILD_CANCELLED');await writeReport(value);
        console.log(`Disposable staging rebuild: ${value.phase??value.status}`);
      },
      source:async()=>{checkCheckout();await waitForValidation(config.sha,env.GITHUB_TOKEN);},
      inspectDatabase:async()=>{
        await client.connect();connected=true;
        await inspectDatabase(client);
        const lock=(await client.query("SELECT pg_try_advisory_lock(hashtextextended('fieldgrid:disposable-staging-rebuild:v1',0)) AS locked")).rows[0];
        requireThat(lock?.locked,'ANOTHER_REBUILD_IS_RUNNING');
      },
      inspectProviders:()=>providers.inspect(),
      inventoryWriters:async()=>{
        previous=await services.inventory();
        requireThat(previous.filter(row=>core.has(row.unit)).every(row=>config.recovery ? !row.active && row.pid===0 : row.active),config.recovery ? 'RECOVERY_REQUIRES_HELD_CORE_SERVICES' : 'CORE_SERVICES_NOT_ACTIVE');
        for(const unit of units)for(const operation of ['stop','start']){
          await boundedCommand('/usr/bin/sudo',['-n','-l','/usr/bin/systemctl',operation,unit],hostEnv,{timeout:10000,code:'WRITER_PERMISSION_REQUIRED'});
        }
        return previous;
      },
      checkBootstrap:async()=>{
        requireThat(manifest.sql.length>0 && manifest.drizzle.length>0,'MIGRATION_MANIFEST_INVALID');
        for(const path of ['lib/db/src/seed/rbac.ts','lib/db/src/seed/sectors.ts']){
          requireThat((await lstat(join(ROOT,path))).isFile(),'CATALOG_SEED_MISSING');
        }
        requireThat((await boundedPnpmVersion())==='11.5.2','PNPM_VERSION_INVALID');
      },
      preflightHealth:async()=>{
        if(config.recovery)return {notApplicable:true,code:'HELD_WRITERS_RECOVERY'};
        activeReleases=await checkHealth(config.health,fetch,{}, {attempts:1});
      },
      stopWriters:state=>services.quiesce(state,async()=>writeReport(report)),
      assertStopped:()=>services.assertStopped(),
      clearStorage:()=>providers.clearStorage(),
      clearSchema:()=>clearApplicationSchema(client),
      clearAuth:()=>providers.clearAuth(),
      migrate:()=>boundedCommand('pnpm',['--filter','@workspace/db','run','db:migrate'],childEnv,{code:'MIGRATION_FAILED'}),
      verifyJournal:()=>verifyJournal(client,manifest),
      seedCatalogs:async()=>{
        for(const seed of ['seed:rbac','seed:sectors'])await boundedCommand('pnpm',['--filter','@workspace/db','run',seed],childEnv,{code:'CATALOG_SEED_FAILED'});
      },
      seedOwners:async()=>{owners=await providers.createOwners();await seedApplication(client,owners,canonical.copyRoles);},
      verifyDatabase:()=>verifyApplication(client,owners,canonical),
      verifyProviders:async()=>{await client.query("NOTIFY pgrst, 'reload schema'");await providers.verifyOwners();await providers.verifyStorage();},
      startWriters:state=>{requireThat(!shuttingDown,'REBUILD_CANCELLED');return services.resume(report.destructiveChangesStarted ? state.map(row=>({...row,active:core.has(row.unit)||row.active})) : state);},
      holdWriters:()=>hold(),
      verifyHealth:async()=>{report.servedReleases=await checkHealth(config.health,fetch,activeReleases??{});},
    };
    async function boundedPnpmVersion(){
      return execFileSync('pnpm',['--version'],{cwd:ROOT,env:{PATH:env.PATH,HOME:env.HOME},encoding:'utf8',timeout:10000}).trim();
    }
    await runRebuild(config,adapter,report);
    if(!['planned','rebuilt'].includes(report.status)) process.exitCode=1;
    if(connected)await client.end();client=null;
  } catch(error) {
    report??={contract:'fieldgrid-disposable-staging-rebuild-v1',project:PROJECT,environment:'staging',
      mode:null,destructiveChangesStarted:false,checks:[]};
    report.status='failed';report.errorCode=safeCode(error);await writeReport(report).catch(()=>{});
    console.error(`Disposable staging rebuild: ${report.errorCode}`);process.exitCode=1;
  } finally {
    process.removeListener('SIGTERM',stopOnSignal);process.removeListener('SIGINT',stopOnSignal);
    if(client)await client.end().catch(()=>{});
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
