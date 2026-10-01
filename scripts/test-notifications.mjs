import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Central notifications: policy, live scope, inbox, templates and exact campaign confirmation', async t => {
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),customer=randomUUID(),object=randomUUID(),contact=randomUUID();
 const users=Object.fromEntries(['admin','staff','coworker','planner','platform','portal','stranger'].map(k=>[k,randomUUID()]));
 const sessions=Object.fromEntries(Object.keys(users).map(k=>[k,randomUUID()]));
 const people={staff:randomUUID(),coworker:randomUUID()};
 const call=async(sql,params=[],who='admin',role='authenticated')=>{await db.query('savepoint operation');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:users[who],session_id:sessions[who],role})]);const r=(await db.query(sql,params)).rows;await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint operation');return r[0]?.data??r;}catch(e){await db.query('rollback to savepoint operation');await db.query('release savepoint operation');throw e;}};
 const query=(op,p={},who='admin',ctx='backoffice',scope=tenant)=>call('select public.notification_query($1,$2,$3,$4) data',[scope,ctx,op,p],who);
 const command=(cmd,p,who='admin',ctx='backoffice',key=randomUUID(),scope=tenant)=>call('select public.notification_command($1,$2,$3,$4,$5) data',[scope,ctx,cmd,p,key],who);
 const grant=async(who,cap,scope={all:true},platform=false)=>{await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,(select id from public.tenant_memberships where tenant_id=$1 and user_id=$2),$3,$4) on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set scope=excluded.scope,enabled=true",[platform?null:tenant,users[who],cap,scope]);};
 const criteria={kind:'staff',personnel_ids:[people.staff]};
 const draft={expected_revision:0,title:'FICTITIOUS notification',body:'FICTITIOUS body',priority:'normal',criteria,channels:['in_app','push','email'],timezone:'Europe/Amsterdam',ack_required:true,action_label:'Bekijken'};
 let campaign;
 try{
  for(const [key,id] of Object.entries(users)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${key}-${id}@notification.test`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[key],id]);}
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS notification tenant')",[id,`notify-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','finance'])",[id]);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);}
  for(const who of ['admin','staff','coworker','planner'])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",[tenant,users[who],who==='admin'?'tenant_admin':who==='planner'?'planner':'staff']);
  for(const who of ['staff','coworker'])await db.query('insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,$4)',[people[who],tenant,users[who],`FICTITIOUS ${who}`]);
  await db.query("insert into public.platform_admins(user_id) values($1)",[users.platform]);
  await grant('platform','platform.notifications.manage_global',{all:true},true);await grant('platform','platform.notifications.templates.manage',{all:true},true);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'NOTIFICATION-CUSTOMER','FICTITIOUS customer')",[customer,tenant]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'NOTIFICATION-OBJECT','FICTITIOUS object','{}')",[object,tenant,customer]);
  await db.query('insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,$4,$5)',[contact,tenant,customer,'FICTITIOUS portal',`portal-${users.portal}@notification.test`]);
  await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)',[tenant,object,users.portal,users.admin]);

  await t.test('current session and concrete customer binding; no fake memberships or platform content bypass',async()=>{
   assert.equal((await query('access')).permissions.send_staff,true);
   assert.equal((await query('access',{},'planner')).permissions.send_staff,false);
   assert.equal((await query('access',{},'portal','customer')).allowed,true);
   assert.equal((await query('access',{},'platform','platform',null)).permissions.send_platform,false);
   await assert.rejects(query('access',{},'stranger','platform',null),e=>e.code==='42501');
   await assert.rejects(query('access',{},'admin','backoffice',other),e=>e.code==='42501');
   await db.query('update auth.sessions set not_after=now()-interval \'1 minute\' where id=$1',[sessions.planner]);
   await assert.rejects(query('access',{},'planner'),e=>e.code==='42501');await db.query('update auth.sessions set not_after=null where id=$1',[sessions.planner]);
  });
  await t.test('precise preview, contextual options and limited grants never broaden selected personnel',async()=>{
   const p=await query('recipients',{criteria});assert.equal(p.recipients.length,1);assert.equal(p.recipients[0].id,users.staff);assert.ok(p.selection_token);assert.equal(p.options.personnel.length,2);
   const explanation=await query('explain',{criteria,type_code:'manual.tenant'});assert.equal(explanation.previews.length,3);assert.equal(explanation.previews[0].body.includes('{bedrijfsnaam}'),false);
   await grant('planner','notifications.send_staff',{personnel_ids:[people.staff]});
   const scoped=await query('recipients',{criteria:{kind:'staff',personnel_ids:[people.staff,people.coworker]}},'planner');assert.equal(scoped.recipients.length,1);assert.equal(scoped.recipients[0].id,users.staff);
   const customers=await query('recipients',{criteria:{kind:'customer',contact_ids:[contact]}});assert.equal(customers.recipients.length,1);assert.equal(customers.recipients[0].id,users.portal);assert.ok(customers.recipients[0].channels.includes('in_app'));assert.equal(JSON.stringify(customers).includes('@notification.test'),false);
  });
  await t.test('campaign publish requires exact reviewed set and strict idempotent payload',async()=>{
   const key=randomUUID();campaign=await command('campaign_save',draft,'admin','backoffice',key);assert.equal((await command('campaign_save',draft,'admin','backoffice',key)).id,campaign.id);
   await assert.rejects(command('campaign_save',{...draft,title:'Changed'},'admin','backoffice',key),e=>e.code==='23505');
   const preview=await query('recipients',{criteria});
   await assert.rejects(command('campaign_publish',{id:campaign.id,expected_revision:campaign.revision,selection_token:'wrong'}),e=>e.code==='40001');
   campaign=await command('campaign_publish',{id:campaign.id,expected_revision:campaign.revision,selection_token:preview.selection_token});
   const frozen=(await db.query('select * from private.notification_campaign_recipients where campaign_id=$1',[campaign.id])).rows;assert.equal(frozen.length,1);assert.equal(frozen[0].user_id,users.staff);
   const requests=(await db.query('select * from private.notification_requests where source_id=$1',[frozen[0].id])).rows;assert.equal(requests.length,1);
   assert.equal((await db.query('select private.notification_source_allowed($1,$2,$3,$4,$5,$6,$7) ok',[tenant,'manual.tenant','campaign',frozen[0].id,String(campaign.revision),users.staff,'staff'])).rows[0].ok,true);
   const detail=await query('campaign',{id:campaign.id});assert.equal(detail.title,draft.title);assert.equal((await query('campaigns',{view:'sent'})).total,1);
  });
  await t.test('selected-channel reachability is current, zero reach cannot publish, and partial suppression stays truthful',async()=>{
   await db.query('savepoint reachability_fixture');
   try {
    let p=await query('recipients',{criteria,channels:['push']});
    assert.equal(p.counts.total,1);assert.equal(p.counts.reachable,0);assert.equal(p.counts.push,0);assert.equal(p.counts.unreachable,1);assert.deepEqual(p.recipients[0].channels,[]);
    const draftOnlyPush=await command('campaign_save',{...draft,title:'FICTITIOUS unreachable push',channels:['push']});
    const explain=await query('explain',{campaign_id:draftOnlyPush.id});assert.equal(explain.recipients.counts.reachable,0);assert.ok(explain.previews.every(v=>v.channel==='push'&&!v.body.includes(draft.body)));
    await assert.rejects(command('campaign_publish',{id:draftOnlyPush.id,expected_revision:draftOnlyPush.revision,selection_token:p.selection_token}),e=>e.code==='23514');
    assert.equal((await db.query('select state from private.notification_campaigns where id=$1',[draftOnlyPush.id])).rows[0].state,'draft');
    assert.equal((await db.query('select count(*)::int n from private.notification_campaign_recipients where campaign_id=$1',[draftOnlyPush.id])).rows[0].n,0);
    const subscription={endpoint:`https://fcm.googleapis.com/fcm/send/FICTITIOUS-${randomUUID()}`,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)},origin:'https://notification-fixture.test'};
    await call("select public.notification_push_device($1,'staff',$2,$3,'subscribe',$4) data",[tenant,users.staff,sessions.staff,subscription],'staff','service_role');
    p=await query('recipients',{criteria,channels:['push']});assert.equal(p.counts.push,1);assert.equal(p.counts.reachable,1);
    await call('select public.notification_device_logout($1,$2)',[users.staff,sessions.staff],'staff','service_role');
    await assert.rejects(command('campaign_publish',{id:draftOnlyPush.id,expected_revision:draftOnlyPush.revision,selection_token:p.selection_token}),e=>e.code==='40001');
    assert.equal((await query('recipients',{criteria,channels:['push']})).counts.reachable,0);
    const unboundContact=randomUUID();
    await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS no portal','no-portal@notification.test')",[unboundContact,tenant,customer]);
    const external=await query('recipients',{criteria:{kind:'customer',contact_ids:[unboundContact]},channels:['in_app']});
    assert.equal(external.counts.total,1);assert.equal(external.counts.reachable,0);assert.equal(external.counts.unreachable,1);assert.equal(external.counts.suppressed,0);
    await db.query("insert into private.notification_preferences(tenant_id,user_id,context,email) values($1,$2,'staff',false)",[tenant,users.coworker]);
    const mixedCriteria={kind:'staff',personnel_ids:[people.staff,people.coworker]};
    const partial=await query('recipients',{criteria:mixedCriteria,channels:['email']});
    assert.deepEqual(partial.counts,{total:2,in_app:0,push:0,email:1,reachable:1,unreachable:1,suppressed:1});
    const partialDraft=await command('campaign_save',{...draft,title:'FICTITIOUS partial email',criteria:mixedCriteria,channels:['email']});
    await command('campaign_publish',{id:partialDraft.id,expected_revision:partialDraft.revision,selection_token:partial.selection_token});
    assert.equal((await query('campaign',{id:partialDraft.id})).recipient_count,2);
   } finally { await db.query('rollback to savepoint reachability_fixture');await db.query('release savepoint reachability_fixture'); }
  });
  await t.test('sender revocation and scoped history cannot be bypassed by an earlier confirmed campaign',async()=>{
   const frozen=(await db.query('select * from private.notification_campaign_recipients where campaign_id=$1',[campaign.id])).rows[0];
   const live=async()=>(await db.query("select private.notification_source_allowed($1,'manual.tenant','campaign',$2,$3,$4,'staff') ok",[tenant,frozen.id,String(campaign.revision),users.staff])).rows[0].ok;
   await db.query("update public.permission_grants set enabled=false where tenant_id=$1 and user_id=$2 and capability='notifications.send_staff'",[tenant,users.admin]);assert.equal(await live(),false);
   await db.query("update public.permission_grants set enabled=true where tenant_id=$1 and user_id=$2 and capability='notifications.send_staff'",[tenant,users.admin]);assert.equal(await live(),true);
   await grant('planner','notifications.sent.read',{personnel_ids:[people.coworker]});assert.equal((await query('campaigns',{view:'sent'},'planner')).total,0);await assert.rejects(query('campaign',{id:campaign.id},'planner'),e=>e.code==='42501');
   await grant('planner','notifications.sent.read',{personnel_ids:[people.staff]});assert.equal((await query('campaigns',{view:'sent'},'planner')).total,1);
   const preview=await query('recipients',{criteria});let changing=await command('campaign_save',{...draft,title:'FICTITIOUS stale selection'});
   await db.query("update public.personnel set status='inactive' where id=$1",[people.staff]);await assert.rejects(command('campaign_publish',{id:changing.id,expected_revision:changing.revision,selection_token:preview.selection_token}),e=>e.code==='40001');await db.query("update public.personnel set status='active' where id=$1",[people.staff]);
  });
  await t.test('global deny wins, CAS prevents overwrite, pending requests never replay after re-enable',async()=>{
   let policy=await command('policy_save',{expected_revision:0,scope:'platform',mode:'off',reason:'FICTITIOUS shutdown'},'platform','platform',randomUUID(),null);
   const decision=(await db.query("select private.notification_policy($1,'manual.tenant','staff','email',$2) result",[tenant,users.staff])).rows[0].result;assert.equal(decision.allowed,false);assert.equal(decision.reason,'platform_blocked');
   await assert.rejects(command('policy_save',{id:policy.id,expected_revision:0,scope:'platform',mode:'on',reason:'stale'},'platform','platform',randomUUID(),null),e=>e.code==='40001');
   await command('policy_save',{expected_revision:0,scope:'tenant',tenant_id:tenant,mode:'on',reason:'FICTITIOUS tenant on'});
   assert.equal((await db.query("select private.notification_policy($1,'manual.tenant','staff','email',$2) result",[tenant,users.staff])).rows[0].result.allowed,false);
   const rules=await query('rules');assert.ok(rules.rules.length>20);assert.ok(rules.policies.some(x=>x.scope==='platform'));assert.equal(rules.policies.find(x=>x.scope==='tenant').effective,false);
   const frozen=(await db.query('select * from private.notification_campaign_recipients where campaign_id=$1',[campaign.id])).rows[0];
   const createdWhileOff=(await db.query("select private.notification_enqueue($1,'manual.tenant','campaign',$2,$3,$4,$5) id",[tenant,frozen.id,String(campaign.revision),`off-enqueue:${randomUUID()}`,{recipient_user_id:users.staff,context:'staff',channels:['email']}])).rows[0].id;
   assert.ok((await db.query('select payload from private.notification_requests where id=$1',[createdWhileOff])).rows[0].payload.suppressed_routes.includes('staff:email'));
   policy=await command('policy_save',{id:policy.id,expected_revision:policy.revision,scope:'platform',mode:'on',reason:'FICTITIOUS restart'},'platform','platform',randomUUID(),null);
   const req=(await db.query("select payload from private.notification_requests where payload->>'campaign_id'=$1",[campaign.id])).rows[0];assert.ok(req.payload.suppressed_routes.includes('staff:email'));
  });
  await t.test('customer campaign candidates use tenant dates and the selected object binding',async()=>{
   const otherObject=randomUUID();await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'NOTIFY-OTHER','FICTITIOUS other object','{}')",[otherObject,tenant,customer]);
   const selected={kind:'customer',contact_ids:[contact],object_ids:[otherObject]};const external=await query('recipients',{criteria:selected});assert.equal(external.recipients.length,1);assert.equal(external.recipients[0].id,contact);assert.deepEqual(external.recipients[0].channels,['email']);
   const own=await query('recipients',{criteria:{...selected,object_ids:[object]}});assert.equal(own.recipients[0].id,users.portal);assert.ok(own.recipients[0].channels.includes('in_app'));
   const day=(await db.query("select name,(now() at time zone name)::date>current_date future from pg_timezone_names where name in ('Pacific/Kiritimati','Etc/GMT+12') and (now() at time zone name)::date<>current_date limit 1")).rows[0];assert.ok(day);
   await db.query('update public.tenants set timezone=$1 where id=$2',[day.name,tenant]);await db.query(`update public.customer_contacts set ${day.future?'active_until':'active_from'}=current_date where id=$1`,[contact]);assert.equal((await query('recipients',{criteria:{kind:'customer',contact_ids:[contact]}})).recipients.length,0);
   await db.query('update public.customer_contacts set active_from=null,active_until=null where id=$1',[contact]);await db.query("update public.tenants set timezone='Europe/Amsterdam' where id=$1",[tenant]);
  });
  await t.test('reschedule debounce settings inherit, explicitly disable and validate their bounded scope',async()=>{
   const seconds=async()=>(await db.query("select private.notification_bundle_seconds($1,'work_order.rescheduled','staff') n",[tenant])).rows[0].n;
   assert.equal(await seconds(),30);
   const global=await command('policy_save',{expected_revision:0,scope:'platform',type_code:'work_order.rescheduled',mode:'inherit',bundle_seconds:60,reason:'FICTITIOUS global debounce'},'platform','platform',randomUUID(),null);
   assert.ok(global.id);assert.equal(await seconds(),60);
   let local=await command('policy_save',{expected_revision:0,scope:'tenant',tenant_id:tenant,type_code:'work_order.rescheduled',context:'staff',mode:'inherit',bundle_seconds:0,reason:'FICTITIOUS no debounce'});
   assert.equal(await seconds(),0);assert.equal((await query('rules')).policies.find(x=>x.id===local.id).effective_bundle_seconds,0);
   local=await command('policy_save',{id:local.id,expected_revision:local.revision,scope:'tenant',tenant_id:tenant,type_code:'work_order.rescheduled',context:'staff',mode:'inherit',bundle_seconds:null,reason:'FICTITIOUS inherit debounce'});
   assert.equal(await seconds(),60);
   for(const patch of [{bundle_seconds:301},{bundle_seconds:1.5},{bundle_seconds:30,type_code:'manual.tenant'},{bundle_seconds:30,channel:'push'}])await assert.rejects(command('policy_save',{expected_revision:0,scope:'tenant',tenant_id:tenant,type_code:'work_order.rescheduled',mode:'inherit',reason:'FICTITIOUS invalid debounce',...patch}),e=>e.code==='23514');
   await assert.rejects(command('policy_save',{id:local.id,expected_revision:local.revision,scope:'tenant',tenant_id:tenant,type_code:'work_order.rescheduled',context:'staff',mode:'inherit',bundle_seconds:10,reason:'FICTITIOUS unauthorized'},'staff','staff'),e=>e.code==='42501');
  });
  await t.test('template plain text validation, draft/publish, tenant field inheritance and immutable versions',async()=>{
   assert.equal((await db.query("select private.notification_template_valid('manual.tenant','{\"title\":\"Plain title\",\"body\":\"Plain body\"}') ok")).rows[0].ok,true);
   const list=await query('templates');assert.ok(list.items.length>20);let template=list.items.find(x=>x.type_code==='quote.available'&&x.channel==='email');assert.ok(template);
   const original=await call("select public.notification_template_resolve($1,'quote.available','customer','email') data",[tenant],'admin','service_role');
   template=await command('template_save',{id:template.id,expected_revision:template.revision,title:'FICTITIOUS {bedrijfsnaam}',body:original.body});
   template=await command('template_publish',{id:template.id,expected_revision:template.revision});
   const resolved=await call("select public.notification_template_resolve($1,'quote.available','customer','email') data",[tenant],'admin','service_role');assert.equal(resolved.title,'FICTITIOUS {bedrijfsnaam}');assert.notEqual(resolved.version_id,original.version_id);
   await assert.rejects(command('template_save',{id:template.id,expected_revision:template.revision,title:'https://untrusted.test',body:'Plain body'}),e=>e.code==='23514');
   let global=(await query('templates',{},'platform','platform',null)).items.find(x=>x.type_code==='quote.available'&&x.channel==='email');
   await command('template_publish',{id:global.id,expected_revision:global.revision,body:'FICTITIOUS new inherited body'},'platform','platform',randomUUID(),null);
   const inherited=await call("select public.notification_template_resolve($1,'quote.available','customer','email') data",[tenant],'admin','service_role');assert.equal(inherited.title,'FICTITIOUS {bedrijfsnaam}');assert.equal(inherited.body,'FICTITIOUS new inherited body');assert.notEqual(inherited.base_version_id,original.base_version_id);
   assert.equal((await query('template',{id:template.id})).body,'FICTITIOUS new inherited body');
   const beforeDraft=inherited.revision;await command('template_save',{id:template.id,expected_revision:template.revision,title:'FICTITIOUS draft only'});
   const active=await call("select public.notification_template_resolve($1,'quote.available','customer','email') data",[tenant],'admin','service_role');assert.equal(active.revision,beforeDraft);assert.equal(active.title,'FICTITIOUS {bedrijfsnaam}');
  });
  await t.test('manual template body roundtrip and push channel safety are effective in the resolver',async()=>{
   let template=(await query('templates')).items.find(x=>x.type_code==='manual.tenant'&&x.context==='staff'&&x.channel==='in_app');const body=template.body+' FICTITIOUS persisted body.';
   template=await command('template_save',{id:template.id,expected_revision:template.revision,body});assert.equal((await query('template',{id:template.id})).body,body);
   template=await command('template_publish',{id:template.id,expected_revision:template.revision});assert.equal((await query('template',{id:template.id})).body,body);assert.equal((await query('templates')).items.find(x=>x.id===template.id).body,body);
   const push=(await query('templates')).items.find(x=>x.type_code==='work_order.dispatched'&&x.context==='staff'&&x.channel==='push');
   for(const body of ['Geheime bon {bonnummer}','X'.repeat(161),'https://example.test'])await assert.rejects(command('template_publish',{id:push.id,expected_revision:push.revision,title:'Nieuwe update',body}),e=>e.code==='23514');
   const safe=await command('template_publish',{id:push.id,expected_revision:push.revision,title:'Update van {bedrijfsnaam}',body:'Bekijk uw beveiligde omgeving.'});const effective=await call("select public.notification_template_resolve($1,'work_order.dispatched','staff','push') data",[tenant],'admin','service_role');assert.equal(effective.title,'Update van {bedrijfsnaam}');assert.equal(effective.push_safe,true);assert.ok(safe.id);
   await db.query('savepoint historical_push');try{const global=(await db.query("select id from private.notification_templates where tenant_id is null and type_code='work_order.started' and context='customer' and channel='push'")).rows[0];const version=(await db.query("insert into private.notification_template_versions(template_id,revision,definition) values($1,999,'{\"title\":\"Old {klantnaam}\",\"body\":\"Old detail\"}') returning id",[global.id])).rows[0];await db.query('update private.notification_templates set active_version_id=$1,revision=999 where id=$2',[version.id,global.id]);const projected=await query('template',{id:global.id});assert.equal(projected.push_safe,false);assert.ok(projected.warning);assert.equal(projected.title,'Nieuwe melding');assert.deepEqual(projected.variables.map(x=>x.name),['bedrijfsnaam']);}finally{await db.query('rollback to savepoint historical_push');}
  });
  await t.test('preferences and independent acknowledgement/read/archive; raw mutation denied',async()=>{
   const p=await query('preferences',{},'staff','staff');await command('preferences_save',{expected_revision:p.revision,email:false,push:true,quiet_enabled:true,quiet_start:'22:00',quiet_end:'07:00',timezone:'Europe/Amsterdam',types:[]},'staff','staff');
   assert.equal((await db.query("select private.notification_policy($1,'manual.tenant','staff','email',$2) result",[tenant,users.staff])).rows[0].result.reason,'personal_off');
   const cr=(await db.query('select id from private.notification_campaign_recipients where campaign_id=$1',[campaign.id])).rows[0];const nid=randomUUID();
   await db.query("insert into public.notifications(id,tenant_id,user_id,channel,title,body,status,context,type_code,source_kind,source_id,source_revision,campaign_id,ack_required) values($1,$2,$3,'in_app','FICTITIOUS own title','FICTITIOUS own body','sent','staff','manual.tenant','campaign',$4,$5,$6,true)",[nid,tenant,users.staff,cr.id,String(campaign.revision),campaign.id]);
   let n=await query('detail',{notification_id:nid},'staff','staff');assert.equal(n.title,'FICTITIOUS own title');n=await command('inbox_ack',{notification_id:nid,expected_revision:n.revision},'staff','staff');
   let detail=await query('detail',{notification_id:nid},'staff','staff');assert.ok(detail.acknowledged_at);assert.equal(detail.read_at,null);
   await command('inbox_read',{notification_id:nid,expected_revision:n.revision},'staff','staff');detail=await query('detail',{notification_id:nid},'staff','staff');assert.ok(detail.read_at);
   await assert.rejects(call('update public.notifications set body=$1 where id=$2',['tampered',nid],'staff'),e=>e.code==='42501');
   await assert.rejects(query('detail',{notification_id:nid},'coworker','staff'),e=>e.code==='42501');
   await db.query("update private.notification_campaigns set state='cancelled' where id=$1",[campaign.id]);detail=await query('detail',{notification_id:nid},'staff','staff');assert.equal(detail.source_available,false);assert.equal(detail.body.includes('FICTITIOUS own body'),false);
   assert.equal((await query('inbox',{},'staff','staff')).total,1);
   assert.equal((await query('inbox',{search:'FICTITIOUS own body'},'staff','staff')).total,0);
  });
 }finally{await db.query('rollback');await db.end();}
});
