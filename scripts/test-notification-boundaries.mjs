import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase,localWorkOrderTestUrl} from './work-order-test-target.mjs';

test('notification administration and legacy receipts keep their live authority',async t=>{
 const db=await workOrderTestDatabase();
 const [tenant,other,person]=Array.from({length:3},()=>randomUUID());
 const users=Object.fromEntries(['admin','scoped','target','staff','platform'].map(k=>[k,randomUUID()]));
 const sessions=Object.fromEntries(Object.keys(users).map(k=>[k,randomUUID()]));
 const call=async(sql,args=[],who='admin',role='authenticated')=>{
  await db.query('savepoint actor_call');try{
   await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:users[who],session_id:sessions[who]})]);
   const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint actor_call');return r.rows;
  }catch(e){await db.query('rollback to savepoint actor_call');await db.query('release savepoint actor_call');throw e;}
 };
 const check=(name,run)=>t.test(name,async()=>{await db.query('savepoint scenario');try{await run();}finally{await db.query('rollback to savepoint scenario');await db.query('release savepoint scenario');}});
 const query=(op,p={},who='admin',ctx='backoffice',scope=tenant)=>call('select public.notification_query($1,$2,$3,$4) data',[scope,ctx,op,p],who).then(r=>r[0].data);
 const command=(cmd,p,who='admin',ctx='backoffice',scope=tenant)=>call('select public.notification_command($1,$2,$3,$4,$5) data',[scope,ctx,cmd,p,randomUUID()],who).then(r=>r[0].data);
 const grant=async(who,cap,scope={all:true},platform=false)=>(await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,(select id from public.tenant_memberships where tenant_id=$1 and user_id=$2),$3,$4) on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set scope=excluded.scope,enabled=true returning id,revision",[platform?null:tenant,users[who],cap,scope])).rows[0];
 const proof=async(payload,who='scoped',ctx='backoffice',scope=tenant)=>{
  const verify=(op,p)=>call('select public.notification_verification($1,$2,$3,$4,$5,$6) data',[scope,ctx,users[who],sessions[who],op,p],who,'service_role').then(r=>r[0].data);
  const v=await verify('request',{action:'grant_save',payload,code:'628471'});
  await verify('delivered',{challenge_id:v.challenge_id,delivered:true});
  return (await verify('confirm',{challenge_id:v.challenge_id,code:'628471'})).verification_id;
 };
 try{
  await db.query('begin');
  for(const [who,id]of Object.entries(users)){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@notification-boundary.test`]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[who],id]);
  }
  for(const id of [tenant,other]){
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS notification boundary')",[id,`notify-boundary-${id}`]);
   await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['personeel','planning'])",[id]);
  }
  for(const [who,role]of [['admin','tenant_admin'],['scoped','planner'],['target','planner'],['staff','staff']])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",[tenant,users[who],role]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS recipient')",[person,tenant,users.staff]);
  await db.query('insert into public.platform_admins(user_id) values($1)',[users.platform]);
  await grant('platform','platform.notifications.templates.manage',{all:true},true);
  await grant('scoped','notifications.permissions',{personnel_ids:[person]});

  await check('a scoped delegate cannot replace a wider or unrelated existing grant',async()=>{
   for(const existingScope of [{all:true},{customer_ids:[]}]){
    // The second scope is populated through a legitimate customer fixture below.
    if(existingScope.customer_ids){const id=randomUUID();await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS other scope')",[id,tenant,`C-${id}`]);existingScope.customer_ids=[id];}
    const g=await grant('target','notifications.send_staff',existingScope);
    const p={user_id:users.target,capability:'notifications.send_staff',scope:{personnel_ids:[person]},expected_revision:g.revision,reason:'FICTITIOUS scope replacement'};
    await assert.rejects(proof(p),e=>e.code==='42501');
    assert.deepEqual((await db.query('select scope from public.permission_grants where id=$1',[g.id])).rows[0].scope,existingScope);
   }
  });
  await check('a saved verification cannot overwrite a grant outside its current management scope',async()=>{
   const scope={personnel_ids:[person]},g=await grant('target','notifications.send_staff',scope);
   const p={user_id:users.target,capability:'notifications.send_staff',scope,expected_revision:g.revision,reason:'FICTITIOUS exact change'};
   const verification_id=await proof(p);
   await db.query("update public.permission_grants set scope='{\"all\":true}' where id=$1",[g.id]);
   await assert.rejects(command('grant_save',{...p,verification_id},'scoped'),e=>e.code==='42501');
   assert.equal((await db.query('select consumed_at from private.notification_verifications where id=$1',[verification_id])).rows[0].consumed_at,null);
   await db.query('update public.permission_grants set scope=$1 where id=$2',[scope,g.id]);
   assert.equal((await command('grant_save',{...p,verification_id},'scoped')).revision,g.revision+1);
  });
  await check('tenant template lists/details/previews never expose unpublished platform content',async()=>{
   const initial=(await query('templates')).items.find(x=>x.type_code==='quote.available'&&x.channel==='email');assert(initial);
   const marker='FICTITIOUS PRIVATE PLATFORM DRAFT';
   const saved=await command('template_save',{id:initial.id,expected_revision:initial.revision,title:marker},'platform','platform',null);
   assert.equal((await query('template',{id:initial.id},'platform','platform',null)).title,marker);
   const detail=await query('template',{id:initial.id});
   assert.equal(detail.title,initial.title);assert.equal(detail.state,'published');assert.equal(detail.revision,initial.revision);
   assert.equal(JSON.stringify(await query('templates')).includes(marker),false);
   assert.equal(JSON.stringify(await call("select public.notification_template_resolve($1,'quote.available','customer','email') data",[tenant],'admin','service_role')).includes(marker),false);
   const local=await command('template_publish',{id:initial.id,expected_revision:initial.revision});
   assert.equal((await query('template',{id:local.id})).title,initial.title);
   assert.equal((await db.query('select draft from private.notification_templates where id=$1',[local.id])).rows[0].draft.title,initial.title);
   assert.equal((await query('template',{id:initial.id},'platform','platform',null)).revision,saved.revision);
   const own=await command('template_save',{id:local.id,expected_revision:local.revision,title:'FICTITIOUS OWN DRAFT'});
   assert.equal((await query('template',{id:own.id})).title,'FICTITIOUS OWN DRAFT');
   assert.equal(JSON.stringify(await query('template',{id:initial.id})).includes(marker),false);
  });
  await check('announcement receipts cannot move tenant/parent or acknowledge an invisible announcement',async()=>{
   const [own,foreign,hidden]=Array.from({length:3},()=>randomUUID());
   for(const [id,scope,audience]of [[own,tenant,['staff']],[foreign,other,['staff']],[hidden,tenant,['hr']]])await db.query("insert into public.announcements(id,tenant_id,title,body,audience_roles,published_at,created_by) values($1,$2,'FICTITIOUS news','FICTITIOUS content',$3,now(),$4)",[id,scope,audience,users.admin]);
   const receipt=(await call('insert into public.announcement_reads(tenant_id,announcement_id,user_id) values($1,$2,$3) returning id',[tenant,own,users.staff],'staff'))[0].id;
   await assert.rejects(call('update public.announcement_reads set tenant_id=$1,announcement_id=$2 where id=$3',[other,foreign,receipt],'staff'),e=>['42501','23514'].includes(e.code));
   await assert.rejects(call('insert into public.announcement_reads(tenant_id,announcement_id,user_id) values($1,$2,$3)',[tenant,hidden,users.staff],'staff'),e=>e.code==='42501');
   await call('insert into public.announcement_reads(tenant_id,announcement_id,user_id) values($1,$2,$3) on conflict(tenant_id,announcement_id,user_id) do update set user_id=excluded.user_id',[tenant,own,users.staff],'staff');
   assert.equal((await call('select id from public.announcement_reads where id=$1',[receipt],'staff')).length,1);
   await db.query('update public.announcements set withdrawn_at=now() where id=$1',[own]);
   assert.equal((await call('select id from public.announcement_reads where id=$1',[receipt],'staff')).length,0);
   assert.equal(JSON.stringify((await call('select public.staff_workspace($1) data',[tenant],'staff'))[0].data).includes(receipt),false);
  });
  await check('announcement receipts fail closed after session or membership revocation',async()=>{
   const announcement=randomUUID();
   await db.query("insert into public.announcements(id,tenant_id,title,body,published_at,created_by) values($1,$2,'FICTITIOUS news','FICTITIOUS content',now(),$3)",[announcement,tenant,users.admin]);
   const receipt=(await call('insert into public.announcement_reads(tenant_id,announcement_id,user_id) values($1,$2,$3) returning id',[tenant,announcement,users.staff],'staff'))[0].id;
   for(const revoked of ['session','membership']){
    if(revoked==='session')await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[sessions.staff]);
    else await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,users.staff]);
    assert.equal((await call('select id from public.announcement_reads where id=$1',[receipt],'staff')).length,0);
    assert.equal((await call('update public.announcement_reads set read_at=now() where id=$1 returning id',[receipt],'staff')).length,0);
    await db.query('update auth.sessions set not_after=null where id=$1',[sessions.staff]);
   }
  });
  await check('assigned reminders require current session, membership, tenant and appropriate personnel scope',async()=>{
   const reminder=randomUUID();
   await db.query("insert into public.reminders(id,tenant_id,personnel_id,assigned_user_id,kind,source_id,title,due_at,deduplication_key) values($1,$2,$3,$4,'contract',$5,'FICTITIOUS private reminder',now(),$6)",[reminder,tenant,person,users.staff,randomUUID(),`FICTITIOUS-${reminder}`]);
   const visible=who=>call('select id from public.reminders where id=$1',[reminder],who).then(r=>r.length);
   assert.equal(await visible('staff'),1);assert.equal(await visible('target'),0);assert.equal(await visible('admin'),1);
   await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[sessions.staff]);assert.equal(await visible('staff'),0);
   await db.query('update auth.sessions set not_after=null where id=$1',[sessions.staff]);
   await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,users.staff]);assert.equal(await visible('staff'),0);
   await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,users.staff]);
   await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);assert.equal(await visible('staff'),0);
   await db.query("update public.tenants set status='active' where id=$1",[tenant]);
   await db.query('update public.reminders set assigned_user_id=$1 where id=$2',[users.target,reminder]);
   await db.query("update public.tenant_memberships set roles=array['hr']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,users.target]);assert.equal(await visible('target'),1);
   await db.query("update public.tenant_memberships set roles=array['planner']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,users.target]);assert.equal(await visible('target'),0);
  });
  await check('customer audit records preserve chronology without copying contact and address content',async()=>{
   const id=randomUUID(),contact=randomUUID(),document=randomUUID(),agreement=randomUUID(),canary='FICTITIOUS-AUDIT-PRIVATE-CONTENT';
   await call('insert into public.customers(id,tenant_id,customer_number,name,billing_email,billing_address) values($1,$2,$3,$4,$5,$6)',[id,tenant,`C-${id}`,canary,'private@audit.test',{street:canary}]);
   await call('insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,$4,$5)',[contact,tenant,id,canary,'contact@audit.test']);
   const path=`${tenant}/${id}/${randomUUID().replaceAll('-','')}.pdf`;
   await call("insert into public.customer_documents(id,tenant_id,customer_id,title,storage_path,file_name,mime_type,size_bytes,sha256,created_by) values($1,$2,$3,$4,$5,'FICTITIOUS.pdf','application/pdf',12,repeat('a',64),$6)",[document,tenant,id,canary,path,users.admin]);
   await call("select public.customer_command($1,$2,'agreement_save',$3)",[tenant,randomUUID(),{id:agreement,customerId:id,title:canary,version:0,state:'draft',type:'service',scope:canary,lines:[]}]);
   await call('update public.customers set phone=$1 where id=$2',['FICTITIOUS-PRIVATE-PHONE',id]);
   const audit=(await db.query('select before_data,after_data from public.audit_events where tenant_id=$1 and entity_id=any($2::uuid[])',[tenant,[id,contact,document,agreement]])).rows;
   assert.equal(audit.length,6);const text=JSON.stringify(audit);
   for(const marker of [canary,'@audit.test','FICTITIOUS-PRIVATE-PHONE',path,'a'.repeat(64)])assert.equal(text.includes(marker),false);
   assert.equal(text.includes('phone'),true);
   const history=(await call('select public.customer_history($1,$2) data',[tenant,id]))[0].data;
   assert.equal(history.length,6);
   for(const source of ['customers','customer_contacts','customer_documents','customer_agreements'])assert(history.some(e=>e.source===source));
  });
 }finally{await db.query('rollback');await db.end();}
});

test('delegation rechecks the locked grant after concurrent scope expansion',async()=>{
 localWorkOrderTestUrl();
 const db=await workOrderTestDatabase(),a=await workOrderTestDatabase(),b=await workOrderTestDatabase();
 const [tenant,actor,target,person,session]=Array.from({length:5},()=>randomUUID());
 let pending;
 try{
  await db.query('begin');
  for(const id of [actor,target])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@notification-race.test`]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS delegation race')",[tenant,`notify-race-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['personeel','planning'])",[tenant]);
  for(const id of [actor,target])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active')",[tenant,id]);
  await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'FICTITIOUS scoped recipient')",[person,tenant]);
  const scope={personnel_ids:[person]};
  for(const [id,cap]of [[actor,'notifications.permissions'],[target,'notifications.send_staff']])await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,(select id from public.tenant_memberships where tenant_id=$1 and user_id=$2),$3,$4)",[tenant,id,cap,scope]);
  const gid=(await db.query("select id from public.permission_grants where tenant_id=$1 and user_id=$2 and capability='notifications.send_staff'",[tenant,target])).rows[0].id;
  await db.query('commit');
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  for(const cmd of ['grant_save','grant_revoke']){
   await db.query('update public.permission_grants set scope=$1,revision=1,enabled=true where id=$2',[scope,gid]);
   const p={...(cmd==='grant_save'?{user_id:target,capability:'notifications.send_staff',scope}:{grant_id:gid}),expected_revision:2,reason:'FICTITIOUS concurrent boundary'};
   await db.query('begin');await db.query('set local role service_role');
   const verify=async(op,input)=>(await db.query("select public.notification_verification($1,'backoffice',$2,$3,$4,$5) data",[tenant,actor,session,op,input])).rows[0].data;
   const v=await verify('request',{action:cmd,payload:p,code:'628471'});
   await verify('delivered',{challenge_id:v.challenge_id,delivered:true});
   const verified=await verify('confirm',{challenge_id:v.challenge_id,code:'628471'});await db.query('commit');
   await a.query('begin');await a.query("update public.permission_grants set scope='{\"all\":true}',revision=2 where id=$1",[gid]);
   await b.query('begin');await b.query("set local statement_timeout='10s'");await b.query('set local role authenticated');
   await b.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
   pending=b.query("select public.notification_command($1,'backoffice',$2,$3,$4)",[tenant,cmd,{...p,verification_id:verified.verification_id},randomUUID()]).then(value=>({value}),error=>({error}));
   let waiting=false;
   for(let i=0;i<100;i++){
    waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting===true;
    if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert(waiting,'command must reach the contested grant lock');await a.query('commit');
   assert.equal((await pending).error?.code,'42501');await b.query('rollback');
   const g=(await db.query('select scope,revision,enabled from public.permission_grants where id=$1',[gid])).rows[0];
   assert.deepEqual(g,{scope:{all:true},revision:2,enabled:true});
   assert.equal((await db.query('select consumed_at from private.notification_verifications where id=$1',[verified.verification_id])).rows[0].consumed_at,null);
  }
 }finally{
  await a.query('rollback');if(pending)await pending;await b.query('rollback');await db.query('rollback');
  try{
   await db.query('begin');
   await db.query('delete from private.notification_verifications where tenant_id=$1',[tenant]);
   await db.query('delete from private.notification_audit where tenant_id=$1',[tenant]);
   await db.query('delete from public.tenants where id=$1',[tenant]);
   await db.query('delete from auth.users where id=any($1::uuid[])',[[actor,target]]);await db.query('commit');
  }finally{await db.query('rollback');await Promise.all([db.end(),a.end(),b.end()]);}
 }
});
