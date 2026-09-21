import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertMigrationAdminUrl,assertRuntimeUrlDescriptor,resolveStagingPoolerHost } from '../fieldgrid-w00-runtime-principal.mjs';
import { databaseNodePostgresSslConfig } from '../fieldgrid-database-root-cert.mjs';
import { PROJECT,REPOSITORY,CONFIRM,sha,uuid,requireThat } from './contract.mjs';
import { parseWriterUnits } from './services.mjs';

export function operationId(runId,sourceSha) {
  requireThat(/^[1-9][0-9]{0,19}$/.test(String(runId))&&sha(sourceSha),'OPERATION_ID');
  const raw=createHash('sha256').update(`${REPOSITORY}:${sourceSha}:${runId}`).digest('hex');
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-4${raw.slice(13,16)}-a${raw.slice(17,20)}-${raw.slice(20,32)}`;
}
export function validateEnvironment(env=process.env,{checkCheckout=true}={}) {
  const mode=env.RESET_MODE;
  requireThat(Object.hasOwn(CONFIRM,mode),'MODE_INVALID');
  requireThat(env.APP_ENV==='staging'&&env.TARGET_ENVIRONMENT==='staging'&&env.EXPECTED_SUPABASE_PROJECT_REF===PROJECT,'ENVIRONMENT_INVALID');
  requireThat(env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REPOSITORY===REPOSITORY&&env.GITHUB_REF==='refs/heads/main','DISPATCH_INVALID');
  requireThat(sha(env.EXPECTED_MAIN_SHA)&&env.GITHUB_SHA===env.EXPECTED_MAIN_SHA&&env.RESET_CONFIRMATION===CONFIRM[mode],'CONFIRMATION_INVALID');
  requireThat(env.FIELDGRID_DATABASE_CONNECTION_PURPOSE==='migration'&&env.DB_SSL==='true'&&env.DB_SSL_REJECT_UNAUTHORIZED==='true'&&env.PGSSLMODE==='verify-full','CONNECTION_PURPOSE');
  requireThat(env.NEXT_PUBLIC_SUPABASE_URL===`https://${PROJECT}.supabase.co`,'SUPABASE_ORIGIN');
  const migration=assertMigrationAdminUrl(env.FIELDGRID_MIGRATION_DATABASE_URL,'staging');
  const host=resolveStagingPoolerHost(migration,env);
  assertRuntimeUrlDescriptor(env.DATABASE_URL,host,'staging');
  const a=new URL(migration),b=new URL(env.DATABASE_URL);
  requireThat(a.username!==b.username&&decodeURIComponent(a.password)!==decodeURIComponent(b.password),'PRINCIPAL_SEPARATION');
  const ssl=databaseNodePostgresSslConfig(env);
  requireThat(uuid(env.FIELDGRID_WP1_TENANT_ID)&&uuid(env.FIELDGRID_WP1_ADMIN_USER_ID),'BOOTSTRAP_CONFIGURATION');
  requireThat(/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID??'')&&Number.isSafeInteger(Number(env.GITHUB_RUN_ID)),'RUN_ID');
  requireThat(/^[1-9][0-9]{0,4}$/.test(env.GITHUB_RUN_ATTEMPT??''),'RUN_ATTEMPT');
  if(checkCheckout) {
    const local=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:10000}).trim();
    requireThat(local===env.EXPECTED_MAIN_SHA,'CHECKOUT_MISMATCH');
  }
  const units=parseWriterUnits(env.FIELDGRID_WP1_WRITER_UNITS);
  const sourceRun=mode==='diagnose'?env.GITHUB_RUN_ID:env.WP1_DIAGNOSE_RUN_ID;
  const context={tenantId:env.FIELDGRID_WP1_TENANT_ID,adminId:env.FIELDGRID_WP1_ADMIN_USER_ID,operationId:operationId(sourceRun,env.EXPECTED_MAIN_SHA)};
  return {mode,sha:env.EXPECTED_MAIN_SHA,runId:Number(env.GITHUB_RUN_ID),attempt:Number(env.GITHUB_RUN_ATTEMPT),sourceRunId:Number(sourceRun),context,units,migration,ssl,origin:env.NEXT_PUBLIC_SUPABASE_URL};
}
export function databaseClient(config) {
  const require=createRequire(new URL('../../lib/db/package.json',import.meta.url));
  const {Client}=require('pg');
  return new Client({connectionString:config.migration,ssl:config.ssl,connectionTimeoutMillis:15000,query_timeout:180000,application_name:'fieldgrid-wp1-reviewed-reset',options:'-c timezone=UTC'});
}
export function providerClient(config,env=process.env) {
  requireThat(typeof env.SUPABASE_SERVICE_ROLE_KEY==='string'&&env.SUPABASE_SERVICE_ROLE_KEY.length>20,'STORAGE_ADMIN_CONFIGURATION');
  const require=createRequire(new URL('../../artifacts/backoffice/package.json',import.meta.url));
  const {createClient}=require('@supabase/supabase-js');
  return createClient(config.origin,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function postgresProcessEnv(config,env=process.env) {
  const u=new URL(config.migration);
  return {PATH:env.PATH,HOME:env.HOME,LANG:'C.UTF-8',PGHOST:u.hostname,PGPORT:u.port,PGDATABASE:u.pathname.slice(1),
    PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'verify-full',
    PGSSLROOTCERT:env.FIELDGRID_DATABASE_SSL_ROOT_CERT,PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c timezone=UTC'};
}
