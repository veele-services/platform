import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir,chmod,stat,mkdtemp,rm,lstat,realpath,writeFile,rename } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ensurePostgresRuntime,startRestoreTarget,stopRestoreTarget } from '../fieldgrid-phase2e-staging-preflight.mjs';
import { inventoryDatabase,resetDatabase } from './database.mjs';
import { requireThat,fail,digest,uuid } from './contract.mjs';

const run=promisify(execFile);
export const PRIVATE_ROOT='/var/www/veele/staging/shared/wp1-reset';
export async function hashFile(path) {
  const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');
}
export async function secureDirectory(path) {
  await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  requireThat(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid(),'PRIVATE_DIRECTORY');
  requireThat(await realpath(path)===resolve(path),'PRIVATE_DIRECTORY_SYMLINK');
  await chmod(path,0o700);return path;
}
export async function privateOperationDirectory(id) {
  requireThat(uuid(id),'OPERATION_ID');
  await secureDirectory(PRIVATE_ROOT);return secureDirectory(join(PRIVATE_ROOT,id));
}
export async function writePrivate(path,value) {
  const temporary=`${path}.new`;
  await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});
  await rename(temporary,path);await chmod(path,0o600);
}
async function command(name,args,env) {
  try{return await run(name,args,{env,timeout:180000,maxBuffer:1024*1024});}
  catch{fail('BACKUP_COMMAND_FAILED');}
}
export async function assertBackupFile(directory,expected) {
  requireThat(digest(expected?.sha256)&&Number.isSafeInteger(expected.sizeBytes)&&expected.sizeBytes>0,'BACKUP_RECEIPT');
  const path=join(directory,'database.dump'),info=await lstat(path);
  requireThat(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0&&info.size===expected.sizeBytes,'BACKUP_FILE_INVALID');
  requireThat(await hashFile(path)===expected.sha256,'BACKUP_DIGEST');
  return path;
}

// Reuse Phase2E's unprivileged PostgreSQL 17 restore engine and canonical role
// setup, but not its unrelated website/routing gates. Otherwise the old test
// document failure would prevent the very cleanup that is supposed to remove it.
export async function backupAndRehearse(sourceClient,sourceEnv,directory,inventory,{runtimeEnvironment=process.env}={}) {
  await ensurePostgresRuntime(runtimeEnvironment);
  const snapshot=(await sourceClient.query('SELECT pg_export_snapshot() AS snapshot')).rows[0]?.snapshot;
  requireThat(typeof snapshot==='string'&&/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(snapshot),'SNAPSHOT_INVALID');
  const schemas=(await sourceClient.query("SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname",[['public','auth','storage','drizzle','app_private']])).rows.map(row=>row.nspname);
  requireThat(['public','auth','storage','drizzle','app_private'].every(name=>schemas.includes(name)),'BACKUP_SCHEMA');
  const dump=join(directory,'database.dump');
  await command('pg_dump',['--format=custom','--compress=6','--large-objects','--no-owner','--strict-names','--lock-wait-timeout=15s',`--snapshot=${snapshot}`,...schemas.flatMap(name=>['--schema',name]),'--file',dump],sourceEnv);
  await chmod(dump,0o600);
  const info=await stat(dump);
  requireThat(info.isFile()&&info.size>0&&info.size<=512*1024*1024,'BACKUP_SIZE');
  const sha256=await hashFile(dump);
  const listing=await command('pg_restore',['--list',dump],{PATH:sourceEnv.PATH,HOME:sourceEnv.HOME,LANG:'C.UTF-8'});
  requireThat(listing.stdout.includes('TABLE DATA'),'BACKUP_CONTENTS');
  const temp=await mkdtemp(join(tmpdir(),'fieldgrid-wp1-restore-'));await chmod(temp,0o700);
  let target,client;
  try {
    target=await startRestoreTarget(temp);
    requireThat(target.pgEnv.PGHOST==='127.0.0.1'&&target.database==='fieldgrid_phase2e_staging_copy','RESTORE_TARGET');
    await command('pg_restore',['--exit-on-error','--no-owner','--dbname',target.database,dump],{PATH:sourceEnv.PATH,HOME:sourceEnv.HOME,LANG:'C.UTF-8',...target.pgEnv,PGOPTIONS:'-c timezone=UTC'});
    const require=createRequire(new URL('../../lib/db/package.json',import.meta.url));const {Client}=require('pg');
    client=new Client({host:'127.0.0.1',port:target.port,database:target.database,user:target.pgEnv.PGUSER,password:target.pgEnv.PGPASSWORD,ssl:false,options:'-c timezone=UTC'});
    await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const restored=await inventoryDatabase(client,inventory.context);await client.query('ROLLBACK');
    requireThat(restored.fingerprint===inventory.fingerprint,'RESTORE_DATA_MISMATCH');
    requireThat(restored.blockers.length===0,'RESTORE_RESET_BLOCKED');
    const proof=await resetDatabase(client,restored,{rehearsal:true});
    requireThat(proof.committed===false&&proof.proof.tenantIsolationVerified===true,'RESET_REHEARSAL_FAILED');
    await client.query('BEGIN READ ONLY');
    const after=await inventoryDatabase(client,inventory.context);await client.query('ROLLBACK');
    requireThat(after.fingerprint===inventory.fingerprint,'REHEARSAL_ROLLBACK_FAILED');
    return {sha256,sizeBytes:info.size,sourceInventoryDigest:inventory.fingerprint,backupRestoreVerified:true,resetRehearsalVerified:true};
  } finally {
    await client?.end().catch(()=>{});
    if(target) await stopRestoreTarget(target);
    await rm(temp,{recursive:true,force:true});
  }
}
