import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { assertBlogTestDatabase, blogTestDatabaseConfig, blogTestDatabaseName } from './blog-test-database.mjs';

async function main() {

// Only the task-owned snapshot container's loopback port, never the source stack or remote DB.
const options=blogTestDatabaseConfig();
const target=process.env.FIELDGRID_BLOG_UPGRADE_TEST_DATABASE ?? 'fieldgrid_blog_upgrade_acceptance';
blogTestDatabaseName(target);
assert.match(target,/^fieldgrid_blog_upgrade_acceptance(?:_[a-z0-9]{1,12})?$/);
const metadata=async(db,table)=>{
  assert.match(table,/^(?:auth|public|storage)\.[a-z_]+$/);
  const {rows:[row]}=await db.query(`select count(*)::integer rows,encode(extensions.digest(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'sha256'),'hex') sha256 from ${table} t`);
  return row;
};
const connection=new pg.Client(options);await connection.connect();
try{
  // The source is an offline copy of the local Fieldgrid cluster, not the user's running database.
  await assertBlogTestDatabase(connection);
  assert.equal((await connection.query('select exists(select 1 from pg_database where datname=$1) present',[target])).rows[0].present,false,'Use a fresh acceptance database; this test never drops an existing database.');
  await connection.query(`create database ${target} template postgres`);
}finally{await connection.end();}
const db=new pg.Client(blogTestDatabaseConfig(process.env,target));await db.connect();
try{
  await assertBlogTestDatabase(db,target);
  assert.equal((await db.query("select to_regclass('private.fieldgrid_blog_posts') object")).rows[0].object,null);
  const tables=['auth.users','auth.sessions','public.tenants','public.tenant_memberships','public.customers','public.objects','public.work_orders','public.permission_catalog'];
  const before={};for (const table of tables) before[table]=await metadata(db,table);
  assert.ok(before['auth.users'].rows>0&&before['public.tenants'].rows>0&&before['public.work_orders'].rows>0,'The copied database must contain real pre-existing local Auth, tenant and operational fixtures.');
  const beforeBuckets=await metadata(db,'storage.buckets');
  const migration=await readFile(new URL('../supabase/migrations/20261113124643_fieldgrid_blog_socialhero.sql',import.meta.url),'utf8');
  await db.query('begin');try{await db.query(migration);await db.query('commit');}catch(error){await db.query('rollback');throw error;}
  const after={};for (const table of tables) after[table]=await metadata(db,table);
  assert.deepEqual(after,before,'Existing rows must remain byte-for-byte equivalent as canonical JSON hashes.');
  const buckets=(await db.query("select count(*)::integer total,count(*) filter(where id='fieldgrid-blog-media' and not public)::integer private_blog from storage.buckets")).rows[0];
  assert.equal(buckets.total,beforeBuckets.rows+1);assert.equal(buckets.private_blog,1);
  const afterOldBuckets=(await db.query("select count(*)::integer rows,encode(extensions.digest(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'sha256'),'hex') sha256 from storage.buckets t where id<>'fieldgrid-blog-media'")).rows[0];assert.deepEqual(afterOldBuckets,beforeBuckets);
  const evidence={database:target,source:'read-only copy of existing local Fieldgrid snapshot; no remote or shared source mutation',tables:tables.map(table=>({table,before:before[table],after:after[table]})),storage:{existingBucketsUnchanged:true,addedPrivateBlogBucket:true},migration:'20261113124643_fieldgrid_blog_socialhero',migrationSha256:createHash('sha256').update(migration).digest('hex'),result:'passed'};
  await writeFile('/tmp/fieldgrid-blog-upgrade-evidence.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(evidence,null,2));
}finally{await db.end();}

}
main().catch(() => { console.error('Lokale blogupgrade geweigerd of mislukt. Controleer de expliciete testconfiguratie en het nieuwe testdoel; verbindingsgegevens worden niet gelogd.'); process.exitCode = 1; });
