import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { inventoryDatabase, resetDatabase, journalSnapshot } from '../../scripts/wp1/database.mjs';
import { copyRoles, bootstrapCanonical, resolveCanonicalManager, verifyCanonical } from '../../scripts/wp1/bootstrap.mjs';
import { hash } from '../../scripts/wp1/contract.mjs';

const require = createRequire(new URL('../../lib/db/package.json',import.meta.url));
const { Client } = require('pg');
function testUrl() {
  const u = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1','localhost'].includes(u.hostname));
  assert.equal(u.pathname,'/fieldgrid_runtime_safety');
  assert.equal(process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET,'1');
  return u.toString();
}
test('WP1 uses the full migrated PostgreSQL 17 database: rollback, bootstrap and RLS', async t => {
  const client = new Client({connectionString:testUrl(),ssl:false}); await client.connect();
  const context={tenantId:randomUUID(),adminId:randomUUID(),operationId:randomUUID()};
  try {
    assert.match((await client.query('SHOW server_version')).rows[0].server_version,/^17\./);
    const historyBefore=hash(await journalSnapshot(client));
    await client.query('BEGIN');
    await client.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)',[context.adminId,`wp1-admin-${context.adminId}@example.invalid`]);
    await client.query("INSERT INTO public.tenants(id,slug,name,status,is_active) VALUES ($1,$2,'WP1 staging fixture','active',true)",[context.tenantId,`wp1-base-${context.tenantId}`]);
    await client.query("INSERT INTO public.organization_settings(tenant_id,naam) VALUES ($1,'WP1 staging fixture')",[context.tenantId]);
    await copyRoles(client,context.tenantId);
    await client.query("INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES ($1,$2,'owner','active')",[context.tenantId,context.adminId]);
    await client.query("INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id) SELECT $1,$2,id FROM public.tenant_roles WHERE tenant_id=$1 AND name='Management' AND is_system",[context.tenantId,context.adminId]);
    const old=await bootstrapCanonical(client,{...context,operationId:randomUUID()});
    await client.query('COMMIT');
    assert.equal(await resolveCanonicalManager(client,context.tenantId),context.adminId);
    async function inventory() {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try { return await inventoryDatabase(client,context); }
      finally { await client.query('ROLLBACK'); }
    }
    const original=await inventory();
    assert.deepEqual(original.blockers,[]);
    assert.ok(original.counts.customers>=2);
    assert.ok(original.counts.assignments>=2);
    await t.test('same production DB core rehearses actual deletes and rolls everything back',async()=>{
      const result=await resetDatabase(client,original,{rehearsal:true});
      assert.equal(result.committed,false);
      assert.equal((await inventory()).fingerprint,original.fingerprint);
    });
    for (const phase of ['before-delete','after-delete','after-bootstrap','before-commit']) {
      await t.test(`failure at ${phase} leaves real data, catalog and journals unchanged`,async()=>{
        await assert.rejects(resetDatabase(client,original,{inject:async current=>{if(current===phase) throw new Error('synthetic failure');}}));
        assert.equal((await inventory()).fingerprint,original.fingerprint);
      });
    }
    await t.test('concurrent migration lock is respected',async()=>{
      const other=new Client({connectionString:testUrl(),ssl:false}); await other.connect();
      try {
        await other.query("SELECT pg_advisory_lock(hashtextextended('fieldgrid:database-migrations:v1',0))");
        await assert.rejects(resetDatabase(client,original),error=>error.code==='MIGRATION_LOCK');
      } finally {await other.end();}
    });
    await t.test('same row counts with changed content invalidate approval',async()=>{
      await client.query("UPDATE public.customers SET name='Changed after approval' WHERE id=$1",[old.customers[0]]);
      await assert.rejects(resetDatabase(client,original),error=>error.code==='INVENTORY_DRIFT');
    });
    const current=await inventory();
    await t.test('real cleanup and canonical bootstrap commit atomically',async()=>{
      const result=await resetDatabase(client,current);
      assert.equal(result.committed,true);
      assert.equal(result.proof.tenantIsolationVerified,true);
      assert.equal((await client.query('SELECT id FROM public.customers WHERE id=ANY($1::uuid[])',[old.customers])).rows.length,0);
      assert.equal(hash(await journalSnapshot(client)),historyBefore);
    });
    await t.test('authenticated canonical verification is read-only and repeatable',async()=>{
      for(let i=0;i<2;i++) {
        await client.query('BEGIN READ ONLY');
        try { assert.equal((await verifyCanonical(client,context)).ready,true); }
        finally { await client.query('ROLLBACK'); }
      }
    });
  } finally {await client.end();}
});
