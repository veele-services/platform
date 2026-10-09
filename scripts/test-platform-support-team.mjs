import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Fieldgrid supportteam: OTP governance, bounded operators and full reporter escalation', async t => {
 const db=await workOrderTestDatabase(); await db.query('begin');
 const users=Object.fromEntries(['owner','operator','manager','staff','outsider'].map(k=>[k,randomUUID()]));
 const sessions=Object.fromEntries(Object.values(users).map(id=>[id,randomUUID()]));
 const tenant=randomUUID(),other=randomUUID(),person=randomUUID();
 const call=async(sql,args=[],who='owner',role='authenticated')=>{
  await db.query('savepoint support_team_call');
  try { await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:users[who],session_id:sessions[users[who]]})]); const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint support_team_call');return r.rows[0]?.data??r.rows; }
  catch(error){await db.query('rollback to savepoint support_team_call');await db.query('release savepoint support_team_call');throw error;}
 };
 const team=(command,input,key=randomUUID(),who='owner')=>call('select public.platform_team_command($1,$2,$3) data',[command,input,key],who);
 const query=(ctx,op,p={},who='operator',scope=null)=>call('select public.ticket_query($1,$2,$3,$4) data',[scope,ctx,op,p],who);
 const command=(ctx,op,p,who,scope)=>call('select public.ticket_command($1,$2,$3,$4,$5) data',[scope,ctx,op,p,randomUUID()],who);
 const denied=promise=>assert.rejects(promise,e=>e.code==='42501');
 let invited,internal,support;
 const input={userId:users.operator,name:'FICTITIOUS Fieldgrid operator',email:`${users.operator}@support-team.invalid`,allTenants:false,tenantIds:[tenant],version:0},key=randomUUID();
 try {
  for(const user of Object.values(users)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@support-team.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[user],user]);}
  await db.query("insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),$1,'otp',now(),now())",[sessions[users.owner]]);
  await db.query('insert into public.platform_admins(user_id) values($1)',[users.owner]);
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,name,slug) values($1,'FICTITIOUS support tenant',$2)",[id,`support-team-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets','planning','personeel'])",[id]);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')",[id,users.manager]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,users.staff]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,email,status) values($1,$2,$3,$1::uuid::text,'FICTITIOUS reporter',$4,'active')",[person,tenant,users.staff,`${users.staff}@support-team.invalid`]);
  await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,source) select m.tenant_id,m.user_id,m.id,cap,'{\"all\":true}'::jsonb,'explicit' from public.tenant_memberships m cross join unnest(array['tickets.support.create','tickets.support.read','tickets.support.reply','tickets.support.manage','tickets.internal.share']) cap where m.user_id=$1 on conflict do nothing",[users.manager]);
  await t.test('requires a current platform owner and real recent OTP before any account preparation',async()=>{
   await denied(team('prepare_invite',input,randomUUID(),'manager'));await denied(team('prepare_invite',input,randomUUID(),'outsider'));
   await db.query("update auth.mfa_amr_claims set authentication_method='password' where session_id=$1",[sessions[users.owner]]);await denied(team('prepare_invite',input));await db.query("update auth.mfa_amr_claims set authentication_method='otp' where session_id=$1",[sessions[users.owner]]);
   assert.equal((await team('prepare_invite',input)).authorized,true);
  });
  await t.test('invitation materializes only explicit support capabilities and a durable payload-bound receipt',async()=>{
   invited=await team('invite',input,key);assert.equal(invited.userId,users.operator);assert.deepEqual(await team('invite',input,key),invited);
   assert.deepEqual((await db.query("select capability from public.permission_grants where user_id=$1 and tenant_id is null and enabled order by capability",[users.operator])).rows.map(r=>r.capability),['platform.support.manage','platform.support.note','platform.support.read','platform.support.reply']);
   assert.equal((await db.query('select count(*) from public.platform_admins where user_id=$1',[users.operator])).rows[0].count,'0');assert.equal((await db.query('select count(*) from public.tenant_memberships where user_id=$1',[users.operator])).rows[0].count,'0');
   await assert.rejects(team('invite',{...input,allTenants:true,tenantIds:[]},key),e=>e.code==='40001');
   await denied(call('select public.platform_team_query() data',[],'operator'));
   assert.equal(await call('select public.platform_workspace_access() data',[],'operator'),true);assert.equal(await call('select public.platform_workspace_access() data',[],'outsider'),false);
  });
  await t.test('existing category-scoped and assigned-only operators can log in without broader content access',async()=>{
   const category=(await db.query("select id from public.ticket_categories where route='platform_support' limit 1")).rows[0].id;
   await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.support.read',$2,'explicit')",[users.outsider,{category_ids:[category]}]);
   assert.equal(await call('select public.platform_workspace_access() data',[],'outsider'),true);
   await db.query("update public.permission_grants set scope='{\"assigned_only\":true}'::jsonb where user_id=$1",[users.outsider]);
   assert.equal(await call('select public.platform_workspace_access() data',[],'outsider'),true);
   await db.query("update public.permission_grants set scope='{\"all\":false,\"assigned_only\":false}'::jsonb where user_id=$1",[users.outsider]);
   assert.equal(await call('select public.platform_workspace_access() data',[],'outsider'),false);
   await db.query('delete from public.permission_grants where user_id=$1',[users.outsider]);
  });
  await t.test('delivery claim is single-use, exact-recipient bound, and uncertain results cannot silently resend',async()=>{
   const claim=await team('claim_delivery',{deliveryId:invited.deliveryId});assert.equal(claim.allowed,true);assert.equal(claim.email,input.email);
   assert.equal((await team('claim_delivery',{deliveryId:invited.deliveryId})).allowed,false);
   await team('finish_delivery',{deliveryId:invited.deliveryId,status:'uncertain'});
   await assert.rejects(team('resend',{userId:users.operator,version:1}),e=>e.code==='23514');
  });
  await t.test('staff → tenant → Fieldgrid uses separate tickets, audience boundaries and an explicit response draft',async()=>{
   const options=await query('staff','options',{},'staff',tenant),category=options.categories.find(c=>!c.confidential&&c.can_escalate).id;
   internal=await command('staff','create',{category_id:category,title:'FICTITIOUS technical issue',body:'ORIGINAL PRIVATE REPORTER CONTEXT'},'staff',tenant);
   let own=await query('tenant','detail',{ticket_id:internal.id},'manager',tenant);
   await command('tenant','reply',{ticket_id:own.id,expected_revision:own.revision,audience:'tenant',body:'TENANT NOTE CANARY'},'manager',tenant);
   own=await query('tenant','detail',{ticket_id:internal.id},'manager',tenant);
   const sc=(await query('support','options',{},'manager',tenant)).categories[0].id;
   const forwarded=await command('tenant','transfer',{ticket_id:own.id,expected_revision:own.revision,category_id:sc,title:'FICTITIOUS reviewed technical question',body:'REVIEWED TECHNICAL CONTEXT',attachment_ids:[]},'manager',tenant);
   support=await query('platform','detail',{ticket_id:forwarded.id});
   assert.equal(support.messages[0].body,'REVIEWED TECHNICAL CONTEXT');for(const hidden of ['ORIGINAL PRIVATE REPORTER CONTEXT','TENANT NOTE CANARY',internal.id,person,users.staff])assert.equal(JSON.stringify(support).includes(hidden),false);
   await denied(query('platform','detail',{ticket_id:internal.id}));
   support=await command('platform','reply',{ticket_id:support.id,expected_revision:support.revision,audience:'platform',body:'PLATFORM NOTE CANARY'},'operator',null);
   assert.equal(JSON.stringify(await query('support','detail',{ticket_id:support.id},'manager',tenant)).includes('PLATFORM NOTE CANARY'),false);
   support=await command('platform','reply',{ticket_id:support.id,expected_revision:support.revision,audience:'reporter',body:'FICTITIOUS reviewed platform answer'},'operator',null);
   assert.equal(JSON.stringify(await query('staff','detail',{ticket_id:internal.id},'staff',tenant)).includes('FICTITIOUS reviewed platform answer'),false);
   const publicReply=support.messages.find(m=>m.body==='FICTITIOUS reviewed platform answer');
   const draft=await query('support','response_draft',{ticket_id:support.id,message_id:publicReply.id},'manager',tenant);assert.equal(draft.body,publicReply.body);
   const target=await query('tenant','detail',{ticket_id:internal.id},'manager',tenant);
   await command('tenant','reply',{ticket_id:target.id,expected_revision:target.revision,audience:'reporter',body:draft.body},'manager',tenant);
   assert.equal(JSON.stringify(await query('staff','detail',{ticket_id:internal.id},'staff',tenant)).includes('FICTITIOUS reviewed platform answer'),true);
  });
  await t.test('support assignment has a recognizable operator and cannot grant another tenant',async()=>{
   support=await query('platform','detail',{ticket_id:support.id});
   support=await command('platform','assign',{ticket_id:support.id,expected_revision:support.revision,assigned_user_id:users.operator},'owner',null);
   assert.equal(support.assigned_user.name,input.name);assert.equal(support.handlers.find(h=>h.id===users.operator).name,input.name);
   const sc=(await query('support','options',{},'manager',other)).categories[0].id;
   const forbidden=await command('support','create',{category_id:sc,title:'OTHER TENANT CANARY',body:'OTHER TENANT CANARY'},'manager',other);
   await denied(query('platform','detail',{ticket_id:forbidden.id}));assert.equal(JSON.stringify(await query('platform','list')).includes('OTHER TENANT CANARY'),false);
   await assert.rejects(command('platform','assign',{ticket_id:forbidden.id,expected_revision:forbidden.revision,assigned_user_id:users.operator},'owner',null),e=>e.code==='42501');
  });
  await t.test('revocation closes old sessions, provider claims and leftover support grants',async()=>{
   const updated=await team('update',{...input,status:'active',version:1,name:'FICTITIOUS updated name'});assert.equal(updated.version,2);
   await assert.rejects(team('revoke',{userId:users.operator,version:1}),e=>e.code==='40001');
   await team('revoke',{userId:users.operator,version:2});
   assert.equal(await call('select public.platform_workspace_access() data',[],'operator'),false);
   await denied(query('platform','detail',{ticket_id:support.id}));assert.equal((await team('claim_delivery',{deliveryId:invited.deliveryId})).allowed,false);
   await db.query("update public.permission_grants set enabled=true where user_id=$1 and capability like 'platform.support.%'",[users.operator]);await denied(query('platform','detail',{ticket_id:support.id}));assert.equal(await call('select public.platform_workspace_access() data',[],'operator'),false);
   assert.equal((await team('invite',input,key)).version,1);assert.equal((await team('claim_delivery',{deliveryId:invited.deliveryId})).allowed,false);
  });
  await t.test('no direct private-table or service-role governance escape, and owner/session removal applies live',async()=>{
   await denied(call('select * from private.platform_support_members'));await denied(call('select public.platform_team_query() data',[],'owner','service_role'));await denied(call('select public.platform_workspace_access() data',[],'owner','anon'));
   await db.query('delete from public.platform_admins where user_id=$1',[users.owner]);await denied(team('prepare_invite',input));
  });
 } finally {await db.query('rollback');await db.end();}
});
