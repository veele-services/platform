import assert from 'node:assert/strict';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

if(process.env.FIELDGRID_STAGING_SMOKE||process.env.DEPLOY_TARGET==='staging')throw Error('Platform upgrade fixtures are local-only');
const phase=process.argv[2];if(!['seed','verify'].includes(phase))throw Error('Use seed or verify');
const db=await workOrderTestDatabase();const id=n=>`facf0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [actor,former,owner,pendingOwner,key,pendingKey]=Array.from({length:6},(_,i)=>id(i+1));
const payload=(request,recipient)=>['FICTITIOUS platform upgrade',`platform-upgrade-${request}`,actor,request,'#222C35','#41AC42',['planning'],'FICTITIOUS original owner',`${recipient}@platform-upgrade.test`];
const provision='select public.provision_platform_tenant($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
try{
 if(phase==='seed'){
  assert.equal((await db.query("select to_regprocedure('public.complete_platform_admin_invitation(uuid,uuid,uuid)') is null before")).rows[0].before,true);
  await db.query('begin');
  for(const user of [actor,former,owner,pendingOwner])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@platform-upgrade.test`]);
  for(const user of [actor,former])await db.query('insert into public.platform_admins(user_id) values($1)',[user]);
  await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.manage_global','{\"all\":true}','bootstrap')",[former]);
  await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.templates.manage','{\"all\":true}','explicit')",[former]);
  await db.query('delete from public.platform_admins where user_id=$1',[former]);
  const tenant=(await db.query(provision,payload(key,owner))).rows[0].id;
  await db.query("update public.tenant_admin_invitations set status='invited',auth_user_id=$1,invited_at='2026-09-29T12:00:00Z' where tenant_id=$2",[owner,tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management']::public.app_role[],'active')",[tenant,owner]);
  await db.query('delete from public.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,owner]);
  const pending=(await db.query(provision,payload(pendingKey,pendingOwner))).rows[0].id;
  await db.query("update public.tenant_admin_invitations set status='failed',last_error='FICTITIOUS delivery failure' where tenant_id=$1",[pending]);
  await db.query('commit');console.log('FICTITIOUS legacy platform invitations and grants seeded locally');
 }else{
  const tenant=(await db.query(provision,payload(key,owner))).rows[0].id;
  const inv=(await db.query('select * from public.tenant_admin_invitations where tenant_id=$1',[tenant])).rows[0];
  assert.equal(inv.bound_at.toISOString(),'2026-09-29T12:00:00.000Z');assert.equal(inv.status,'invited');assert.equal(inv.auth_user_id,owner);assert.equal(inv.request_fingerprint,null);
  await assert.rejects(db.query(provision,payload(key,actor)),e=>e.code==='23505');
  assert.equal((await db.query('select public.complete_platform_admin_invitation($1,$2,$3) done',[tenant,actor,owner])).rows[0].done,false);
  assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where tenant_id=$1',[tenant])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from public.permission_grants where user_id=$1 and source='bootstrap' and enabled",[former])).rows[0].n,0);
  assert.equal((await db.query("select enabled from public.permission_grants where user_id=$1 and capability='platform.notifications.templates.manage'",[former])).rows[0].enabled,true);
  const pending=(await db.query(provision,payload(pendingKey,pendingOwner))).rows[0].id;
  assert.equal((await db.query('select public.complete_platform_admin_invitation($1,$2,$3) done',[pending,actor,pendingOwner])).rows[0].done,true);
  assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where tenant_id=$1 and user_id=$2',[pending,pendingOwner])).rows[0].n,1);
  console.log('Legacy invitation history preserved, revoked ownership not restored, unfinished delivery retry works, orphan bootstrap grants disabled, explicit delegation preserved');
 }
}finally{await db.query('rollback');await db.end();}
