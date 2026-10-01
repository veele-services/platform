import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('platform onboarding and derived capabilities respect original identity and revocation',async t=>{
  const db=await workOrderTestDatabase();const actor=randomUUID(),owner=randomUUID(),session=randomUUID(),key=randomUUID();let tenant;
  const call=async(sql,args=[],role='authenticated')=>{
    await db.query('savepoint platform_actor');
    try{
      await db.query(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,role})]);
      const result=await db.query(sql,args);
      await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint platform_actor');return result.rows;
    }catch(error){await db.query('rollback to savepoint platform_actor');await db.query('release savepoint platform_actor');throw error;}
  };
  const payload=['FICTITIOUS platform replay',`platform-security-${key}`,actor,key,'#222C35','#41AC42',['planning','tickets'],'FICTITIOUS original owner',`${owner}@platform-security.test`,null,null];
  const provision=(overrides={})=>call('select public.provision_platform_tenant($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id',Object.assign([...payload],overrides),'service_role');
  try{
    await db.query('begin');
    for(const user of [actor,owner])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@platform-security.test`]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
    await db.query('insert into public.platform_admins(user_id) values($1)',[actor]);
    await t.test('new provisioning and identical retries return exactly one tenant without silent actor membership',async()=>{
      tenant=(await provision())[0].id;assert.equal((await provision())[0].id,tenant);
      assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where tenant_id=$1',[tenant])).rows[0].n,0);
    });
    await t.test('same key with changed owner, name or tenant identity is rejected before membership or Auth side effects',async()=>{
      for(const changed of [{8:`${actor}@platform-security.test`},{8:`${randomUUID()}@platform-security.test`},{7:'CHANGED OWNER'},{1:`changed-${key}`}])await assert.rejects(provision(changed),e=>e.code==='23505');
    });
    await t.test('canonical retries survive reordered modules, case normalization and later branding changes',async()=>{
      await db.query("update public.tenant_branding set primary_color='#112233' where tenant_id=$1",[tenant]);
      assert.equal((await provision({0:`  ${payload[0]} `,1:payload[1].toUpperCase(),4:'#222c35',6:['tickets','planning','tickets'],8:payload[8].toUpperCase()}))[0].id,tenant);
      await assert.rejects(provision({4:'#112233'}),e=>e.code==='23505');
    });
    await t.test('one atomic recipient binding, completed retry never restores revoked or deleted membership',async()=>{
      const complete=user=>call('select public.complete_platform_admin_invitation($1,$2,$3) done',[tenant,actor,user],'service_role');
      await assert.rejects(call('select public.complete_platform_admin_invitation($1,$2,$3)',[tenant,actor,owner]),e=>e.code==='42501');
      await assert.rejects(complete(actor),e=>e.code==='42501');
      assert.equal((await complete(owner))[0].done,true);
      assert.equal((await complete(owner))[0].done,false);
      await db.query("update public.tenant_memberships set status='suspended',roles=array['staff']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,owner]);
      assert.equal((await complete(owner))[0].done,false);
      const row=(await db.query('select status,roles::text[] roles from public.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,owner])).rows[0];
      assert.equal(row.status,'suspended');assert.deepEqual(row.roles,['staff']);
      await db.query('delete from public.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,owner]);
      assert.equal((await complete(owner))[0].done,false);
      assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where tenant_id=$1',[tenant])).rows[0].n,0);
      assert.equal((await call("update public.tenant_admin_invitations set status='failed' where tenant_id=$1 and bound_at is null and status in ('pending','failed') returning id",[tenant],'service_role')).length,0);
      await assert.rejects(call("update public.tenant_admin_invitations set bound_at=null,status='failed' where tenant_id=$1",[tenant],'service_role'),e=>e.code==='23514');
      await assert.rejects(call('update public.tenant_admin_invitations set email=$1 where tenant_id=$2',[`${actor}@platform-security.test`,tenant],'service_role'),e=>e.code==='23514');
      // Auth account cleanup clears the FK without losing the one-way marker.
      await db.query('delete from auth.users where id=$1',[owner]);
      assert.equal((await complete(actor))[0].done,false);
    });
    await t.test('bootstrap support and notification capabilities cease when the platform role is removed',async()=>{
      await db.query('savepoint platform_revocation');
      try{
        let config=(await call("select public.ticket_query(null,'platform','config','{}') data"))[0].data;
        assert.equal(config.permissions.configure,true);assert.equal(config.permissions.delegate,true);
        await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.manage_global','{\"all\":true}','bootstrap') on conflict do nothing",[actor]);
        await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.permissions','{\"all\":true}','bootstrap') on conflict do nothing",[actor]);
        await db.query('delete from public.platform_admins where user_id=$1',[actor]);
        config=(await call("select public.ticket_query(null,'platform','config','{}') data"))[0].data;
        assert.equal(config.permissions.configure,false);assert.equal(config.permissions.delegate,false);assert.deepEqual(config.categories,[]);assert.deepEqual(config.grants,[]);
        for(const cmd of ['settings_save','category_save','group_save','grant_save'])await assert.rejects(call('select public.ticket_command(null,\'platform\',$1,\'{}\',$2)',[cmd,randomUUID()]),e=>e.code==='42501');
        assert.equal((await db.query("select private.notification_cap(null,$1,'platform.notifications.manage_global') allowed",[actor])).rows[0].allowed,false);
        assert.equal((await db.query("select private.notification_delegation_scope(null,'platform',$1) scope",[actor])).rows[0].scope,null);
        // Explicit delegation has an independent lifecycle, unlike seeded authority.
        await db.query('rollback to savepoint platform_revocation');
        await db.query("update public.permission_grants set source='explicit' where user_id=$1 and capability='platform.support.config'",[actor]);
        await db.query('delete from public.platform_admins where user_id=$1',[actor]);
        config=(await call("select public.ticket_query(null,'platform','config','{}') data"))[0].data;
        assert.equal(config.permissions.configure,true);assert.equal(config.permissions.delegate,false);
        await db.query('insert into public.platform_admins(user_id) values($1)',[actor]);
        config=(await call("select public.ticket_query(null,'platform','config','{}') data"))[0].data;
        assert.equal(config.permissions.delegate,false,'Re-adding the role cannot resurrect its disabled grant tombstone');
      }finally{await db.query('rollback to savepoint platform_revocation');await db.query('release savepoint platform_revocation');}
    });
    await t.test('raw platform-role lookup honors the live session boundary',async()=>{
      assert.equal((await call('select user_id from public.platform_admins')).length,1);
      await db.query('delete from auth.sessions where id=$1',[session]);
      assert.equal((await call('select user_id from public.platform_admins')).length,0);
    });
  }finally{await db.query('rollback');await db.end();}
});

test('concurrent local onboarding retries bind once and a late failure cannot undo completion',async()=>{
  if(process.env.FIELDGRID_STAGING_SMOKE||process.env.DEPLOY_TARGET==='staging')throw Error('Committed synthetic concurrency fixtures are local only');
  const db=await workOrderTestDatabase(),a=await workOrderTestDatabase(),b=await workOrderTestDatabase();
  const actor=randomUUID(),owner=randomUUID(),key=randomUUID();let tenant;const pending=[];
  const payload=['FICTITIOUS concurrent onboarding',`platform-race-${key}`,actor,key,'#222C35','#41AC42',['planning'],'FICTITIOUS owner',`${owner}@platform-security.test`];
  const provision='select public.provision_platform_tenant($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
  const begin=async c=>{await c.query('begin');await c.query('set local role service_role');};
  const blocked=async pid=>{
    for(let attempt=0;attempt<100;attempt++){
      if((await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[pid])).rows[0]?.blocked)return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.fail('Competing RPC must actually wait on the transaction lock');
  };
  try{
    for(const user of [actor,owner])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@platform-security.test`]);
    await db.query('insert into public.platform_admins(user_id) values($1)',[actor]);
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    await begin(a);tenant=(await a.query(provision,payload)).rows[0].id;
    await begin(b);const secondProvision=b.query(provision,payload);pending.push(secondProvision);await blocked(pid);
    await a.query('commit');assert.equal((await secondProvision).rows[0].id,tenant);await b.query('commit');
    await begin(a);
    assert.equal((await a.query('select public.complete_platform_admin_invitation($1,$2,$3) done',[tenant,actor,owner])).rows[0].done,true);
    await begin(b);const secondBind=b.query('select public.complete_platform_admin_invitation($1,$2,$3) done',[tenant,actor,owner]);pending.push(secondBind);await blocked(pid);
    const lateFailure=db.query("update public.tenant_admin_invitations set status='failed' where tenant_id=$1 and bound_at is null and status in ('pending','failed') returning id",[tenant]);pending.push(lateFailure);
    await a.query('commit');assert.equal((await secondBind).rows[0].done,false);await b.query('commit');assert.equal((await lateFailure).rowCount,0);
    assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where tenant_id=$1',[tenant])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from public.audit_events where tenant_id=$1 and action='tenant.admin.initial_bound'",[tenant])).rows[0].n,1);
  }finally{
    await a.query('rollback');await b.query('rollback');await Promise.allSettled(pending);
    // Exact generated fixture identities only; never real tenant data.
    if(tenant){
      await db.query('delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)',[tenant]);
      await db.query('delete from private.notification_templates where tenant_id=$1',[tenant]);
      await db.query('delete from public.audit_events where tenant_id=$1',[tenant]);
      await db.query('delete from public.tenants where id=$1',[tenant]);
    }
    await db.query('delete from auth.users where id=any($1)',[[actor,owner]]);
    await Promise.all([db.end(),a.end(),b.end()]);
  }
});
