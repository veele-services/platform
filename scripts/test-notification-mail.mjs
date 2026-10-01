import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Notification mail adapters: persisted snapshots, live recipients and terminal outcomes', async t => {
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),customer=randomUUID(),request=randomUUID(),event=randomUUID(),recipient='fictitious@example.test';
 const sql=async(q,p=[])=>(await db.query(q,p)).rows;
 const service=async(q,p=[])=>{await db.query('savepoint service_call');await db.query('set local role service_role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'service_role'})]);try{return await sql(q,p);}catch(e){await db.query('rollback to savepoint service_call');throw e;}finally{await db.query('reset role');}};
 const safeReject=async(fn)=>{await db.query('savepoint expected_failure');try{await assert.rejects(fn);}finally{await db.query('rollback to savepoint expected_failure');}};
 const gate=async(op,id,key,input={})=>(await service('select public.notification_provider_gate($1,$2,$3,$4,$5,null,$6,$7,$8) result',[op,tenant,'request.received','customer','email',id,key,{source_kind:'mail',recipient,...input}]))[0].result;
 const snapshot={fromEmail:'sender@example.test',fromName:'FICTITIOUS',to:recipient,subject:'FICTITIOUS original',text:'FICTITIOUS body',html:'<p>FICTITIOUS body</p>',targetUrl:'https://example.test/klant/aanvragen',templateRevision:1,attachmentPath:null,attachmentFilename:null};
 let claim;
 try {
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS notifications')",[id,`notify-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','finance'])",[id]);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);}
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,'TEST-NOTIFICATION','FICTITIOUS customer',$3)",[customer,tenant,recipient]);
  await db.query("insert into public.requests(id,tenant_id,request_number,customer_id,discipline,description,subject) values($1,$2,'TEST-REQUEST',$3,'Test','FICTITIOUS request','FICTITIOUS request')",[request,tenant,customer]);
  await db.query("insert into public.commercial_events(id,tenant_id,request_id,kind) values($1,$2,$3,'request.received')",[event,tenant,request]);
  claim=(await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event,recipient]))[0].result;
  await t.test('first attempt freezes and retry does not change content or template revision',async()=>{
   const freeze=async(d)=>(await service('select public.notification_mail_snapshot($1,$2,$3) result',[tenant,claim.id,d]))[0].result;
   assert.deepEqual(await freeze(snapshot),snapshot);
   assert.deepEqual(await freeze({...snapshot,subject:'Changed later',templateRevision:2}),snapshot);
   await safeReject(()=>db.query("update public.mail_deliveries set render_snapshot=jsonb_set(render_snapshot,'{delivery,subject}','\"Tampered\"') where id=$1",[claim.id]));
   await safeReject(()=>service('select public.notification_mail_snapshot($1,$2,$3)',[other,claim.id,snapshot]));
  });
  await t.test('mail snapshot and source access cannot be called anonymously',async()=>{
   for(const role of ['anon','authenticated']){
    await db.query('savepoint expected_failure');await db.query(`set local role ${role}`);
    try{await assert.rejects(()=>db.query('select public.notification_mail_snapshot($1,$2,$3)',[tenant,claim.id,snapshot]),e=>e.code==='42501');}finally{await db.query('rollback to savepoint expected_failure');}
   }
  });
  await t.test('source recipient changes invalidate the old email without rewriting it',async()=>{
   assert.equal((await sql('select private.notification_mail_source_allowed($1,$2,$3) ok',[claim.id,recipient,'request.received']))[0].ok,true);
   await db.query("update public.customers set billing_email='changed@example.test' where id=$1",[customer]);
   assert.equal((await gate('begin',claim.id,'fixture-changed')).reason,'source_unavailable');
   await db.query('update public.customers set billing_email=$1 where id=$2',[recipient,customer]);
  });
  await t.test('expired or future contact periods cannot receive a delayed commercial message',async()=>{
   await db.query('savepoint contact_period');
   try{
    const contact=randomUUID();await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,active) values($1,$2,$3,'FICTITIOUS contact',$4,true)",[contact,tenant,customer,recipient]);
    await db.query('update public.requests set contact_id=$1 where id=$2',[contact,request]);
    assert.equal((await sql('select private.notification_mail_source_allowed($1,$2,$3) ok',[claim.id,recipient,'request.received']))[0].ok,true);
    await db.query("update public.customer_contacts set active_until=current_date-2 where id=$1",[contact]);
    assert.equal((await sql('select private.notification_mail_source_allowed($1,$2,$3) ok',[claim.id,recipient,'request.received']))[0].ok,false);
    await db.query("update public.customer_contacts set active_until=null,active_from=current_date+2 where id=$1",[contact]);
    assert.equal((await sql('select private.notification_mail_source_allowed($1,$2,$3) ok',[claim.id,recipient,'request.received']))[0].ok,false);
   }finally{await db.query('rollback to savepoint contact_period');}
  });
  await t.test('master switch blocks a direct commercial send, not its business record',async()=>{
   const p=randomUUID();await db.query("insert into private.notification_policies(id,scope,mode) values($1,'platform','off')",[p]);
   const r=await gate('begin',claim.id,'fixture-blocked');assert.equal(r.allowed,false);assert.equal(r.reason,'platform_blocked');
   assert.equal((await sql('select count(*) from public.requests where id=$1',[request]))[0].count,'1');
   await db.query('delete from private.notification_policies where id=$1',[p]);
  });
  await t.test('permit begin and finish preserve recipient identity; accepted is terminal',async()=>{
   const key=`fixture-accepted-${event}`;const r=await gate('begin',claim.id,key);assert.equal(r.allowed,true);
   assert.equal((await gate('finish',claim.id,key,{permit_id:r.id,outcome:'accepted'})).ok,true);
   assert.equal((await gate('begin',claim.id,key)).allowed,false);
  });
  await t.test('suppressed and uncertain legacy mail cannot be automatically reclaimed',async()=>{
   for(const status of ['suppressed','uncertain','cancelled','sent','processing']){
    await db.query('update public.mail_deliveries set status=$1,locked_until=now()-interval \'1 day\' where id=$2',[status,claim.id]);
    const r=(await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event,recipient]))[0].result;assert.equal(r.send,false,status);
   }
   await db.query("update public.mail_deliveries set status='failed' where id=$1",[claim.id]);
   assert.equal((await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event,recipient]))[0].result.send,true);
  });
  await t.test('generic financial mail claims never retry an expired in-flight attempt',async()=>{
   const key=`fixture-finance-${event}`;
   const a=(await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',key]))[0];assert.equal(a.should_send,true);
   await db.query("update public.mail_deliveries set locked_until=now()-interval '1 day' where id=$1",[a.delivery_id]);
   assert.equal((await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',key]))[0].should_send,false);
  });
  await t.test('quiet-hour deferral has one owner, lease CAS and no duplicate send',async()=>{
   await db.query('savepoint deferred_fixture');
   try{
    const defer=()=>service('select public.notification_deferred_mail($1,$2,$3,$4) result',['defer',tenant,claim.id,{type:'request.received',context:'customer',available_at:new Date(Date.now()+3600000).toISOString()}]);
    assert.equal((await defer())[0].result.ok,true);
    assert.equal((await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event,recipient]))[0].result.send,false);
    assert.deepEqual((await service("select public.notification_deferred_mail('claim',$1) result",[tenant]))[0].result,[]);
    await db.query("update private.notification_deferred_mail set available_at=now()-interval '1 minute' where mail_id=$1",[claim.id]);
    const jobs=(await service("select public.notification_deferred_mail('claim',$1) result",[tenant]))[0].result;
    assert.equal(jobs.length,1);assert.deepEqual(jobs[0].snapshot,snapshot);
    const finish=(lease,outcome)=>service('select public.notification_deferred_mail($1,$2,$3,$4) result',['finish',tenant,claim.id,{lease_id:lease,outcome,provider_id:'fixture-accepted'}]);
    assert.equal((await finish(randomUUID(),'sent'))[0].result.ok,false);
    assert.equal((await finish(jobs[0].lease_id,'sent'))[0].result.ok,true);
    assert.equal((await finish(jobs[0].lease_id,'sent'))[0].result.ok,false);
    assert.deepEqual((await service("select public.notification_deferred_mail('claim',$1) result",[tenant]))[0].result,[]);
   }finally{await db.query('rollback to savepoint deferred_fixture');}
  });
  await t.test('disable then enable does not replay deferred document mail',async()=>{
   await db.query('savepoint deferred_off');
   try{
    await service('select public.notification_deferred_mail($1,$2,$3,$4)',['defer',tenant,claim.id,{type:'request.received',context:'customer',available_at:new Date(Date.now()+3600000).toISOString()}]);
    const p=randomUUID();await db.query("insert into private.notification_policies(id,tenant_id,scope,mode) values($1,$2,'tenant','off')",[p,tenant]);
    const fixtureMails=(await sql('select id from public.mail_deliveries where tenant_id=$1',[tenant])).map(row=>row.id);
    assert.equal(fixtureMails.length,2); // deferred commercial + unadmitted financial claim
    // This worker operation reports a global count. Parallel suites may have
    // committed other eligible mail, so assert both exact fixture outcomes.
    assert.ok((await sql('select private.notification_suppress_deferred_mail() count'))[0].count>=2);
    assert.deepEqual((await sql('select distinct status from public.mail_deliveries where id=any($1::uuid[])',[fixtureMails])).map(row=>row.status),['suppressed']);
    await db.query('delete from private.notification_policies where id=$1',[p]);
    await db.query("update private.notification_deferred_mail set available_at=now()-interval '1 minute' where mail_id=$1",[claim.id]);
    assert.deepEqual((await service("select public.notification_deferred_mail('claim',$1) result",[tenant]))[0].result,[]);
    assert.equal((await sql('select status from public.mail_deliveries where id=$1',[claim.id]))[0].status,'suppressed');
   }finally{await db.query('rollback to savepoint deferred_off');}
  });
  await t.test('expired deferred provider work remains uncertain, not zero-risk retry',async()=>{
   await db.query('savepoint deferred_uncertain');
   try{
    await service('select public.notification_deferred_mail($1,$2,$3,$4)',['defer',tenant,claim.id,{type:'request.received',context:'customer',available_at:new Date(Date.now()+3600000).toISOString()}]);
    await db.query("update private.notification_deferred_mail set state='processing',lease_until=now()-interval '1 minute' where mail_id=$1",[claim.id]);
    await service("select public.notification_deferred_mail('claim',$1)",[tenant]);
    assert.equal((await sql('select status from public.mail_deliveries where id=$1',[claim.id]))[0].status,'uncertain');
   }finally{await db.query('rollback to savepoint deferred_uncertain');}
  });
  await t.test('commercial events created while disabled cannot be revived by a later flush',async()=>{
   await db.query('savepoint event_off');
   try{
    const p=randomUUID(),e=randomUUID();await db.query("insert into private.notification_policies(id,scope,mode) values($1,'platform','off')",[p]);
    await db.query("insert into public.commercial_events(id,tenant_id,request_id,kind) values($1,$2,$3,'request.received')",[e,tenant,request]);
    await db.query('delete from private.notification_policies where id=$1',[p]);
    const result=(await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,e,recipient]))[0].result;
    assert.equal(result.send,false);assert.equal(result.status,'suppressed');
    assert.equal((await sql('select count(*) from public.requests where id=$1',[request]))[0].count,'1');
   }finally{await db.query('rollback to savepoint event_off');}
  });
  await t.test('disable between ordinary claim and permit prevents replay; security activation is excluded',async()=>{
   await db.query('savepoint mail_prepermit');
   try{
    const p=randomUUID();await db.query("insert into private.notification_policies(id,scope,mode) values($1,'platform','off')",[p]);
    await sql('select private.notification_suppress_deferred_mail()');
    assert.equal((await sql('select status from public.mail_deliveries where id=$1',[claim.id]))[0].status,'suppressed');
    const denied=(await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',`fixture-disabled-${event}`]))[0];
    assert.equal(denied.should_send,false);assert.equal(denied.current_status,'suppressed');
    const activation=(await sql("insert into public.mail_deliveries(tenant_id,recipient,template,status,attempts,idempotency_key,render_snapshot) values($1,$2,'personnel_invitation','processing',1,$3,'{\"notification_kind\":\"security\"}') returning status",[tenant,recipient,`fixture-security-${event}`]))[0];
    assert.equal(activation.status,'processing');
    await db.query('delete from private.notification_policies where id=$1',[p]);
    assert.equal((await gate('begin',claim.id,`fixture-after-off-${event}`)).allowed,false);
    assert.equal((await service('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event,recipient]))[0].result.send,false);
   }finally{await db.query('rollback to savepoint mail_prepermit');}
  });
  await t.test('tenant branding editors cannot replace or delete frozen historical mail logos',async()=>{
   await db.query('savepoint branding_guard');
   try{
    const user=randomUUID(),frozen=`${tenant}/notification-assets/${'a'.repeat(64)}.png`,editable=`${tenant}/fixture-logo.png`;
    await db.query('insert into auth.users(id,email) values($1,$2)',[user,`logo-${user}@example.test`]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[user]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,user]);
    await db.query("insert into storage.objects(bucket_id,name) values('branding',$1),('branding',$2)",[frozen,editable]);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);
    await db.query('set local role authenticated');
    // All branding bytes now use immutable server-only scanned publication.
    assert.equal((await db.query("update storage.objects set metadata='{}' where bucket_id='branding' and name=$1",[editable])).rowCount,0);
    assert.equal((await db.query("update storage.objects set metadata='{}' where bucket_id='branding' and name=$1",[frozen])).rowCount,0);
    await db.query("select set_config('storage.allow_delete_query','true',true)"); // emulate the Storage API; metadata-only rollback fixture
    assert.equal((await db.query("delete from storage.objects where bucket_id='branding' and name=$1",[frozen])).rowCount,0);
    await safeReject(()=>db.query("insert into storage.objects(bucket_id,name) values('branding',$1)",[`${tenant}/notification-assets/${'b'.repeat(64)}.png`]));
   }finally{await db.query('rollback to savepoint branding_guard');}
  });
  await t.test('deferred attachment resolution binds tenant, parent, digest and current recipient',async()=>{
   await db.query('savepoint mail_file_scope');
   try{
    const user=randomUUID(),invoice=randomUUID(),path=`${tenant}/${invoice}/fixture.pdf`;
    await db.query('insert into auth.users(id,email) values($1,$2)',[user,`files-${user}@example.test`]);
    await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot,finalized_at,pdf_storage_path,pdf_sha256) values($1,$2,$3,$4,'final','FICTITIOUS-MAIL-FILE',current_date,current_date+14,'{}','{}','[]',now(),$5,$6)",[invoice,tenant,customer,user,path,'a'.repeat(64)]);
    const job=(await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',`fixture-file-${invoice}`]))[0];
    await db.query("update public.mail_deliveries set render_snapshot=jsonb_build_object('invoice_id',$1::text) where id=$2",[invoice,job.delivery_id]);
    const resolve=(tid=tenant)=>service('select public.notification_mail_attachment($1,$2) file',[tid,job.delivery_id]);
    await service('select public.notification_mail_snapshot($1,$2,$3)',[tenant,job.delivery_id,{...snapshot,attachmentPath:path,attachmentFilename:'fixture.pdf'}]);
    const file=(await resolve())[0].file;assert.deepEqual(file.scope,[tenant,invoice]);assert.equal(file.path,path);assert.equal(file.sha256,'a'.repeat(64));
    await assert.rejects(resolve(other),e=>e.code==='42501');
    await db.query("update public.customers set billing_email='not-the-recipient@example.test' where id=$1",[customer]);
    await assert.rejects(resolve(),e=>e.code==='42501');
    await db.query('update public.customers set billing_email=$1 where id=$2',[recipient,customer]);
    for(const role of ['anon','authenticated']){
     await db.query('savepoint no_file_authority');await db.query(`set local role ${role}`);
     try{await assert.rejects(db.query('select public.notification_mail_attachment($1,$2)',[tenant,job.delivery_id]),e=>e.code==='42501');}
     finally{await db.query('rollback to savepoint no_file_authority');}
    }
    // A different frozen parent is denied even inside the same tenant.
    const wrong=(await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',`fixture-file-wrong-${invoice}`]))[0];
    await db.query("update public.mail_deliveries set render_snapshot=jsonb_build_object('invoice_id',$1::text) where id=$2",[invoice,wrong.delivery_id]);
    await service('select public.notification_mail_snapshot($1,$2,$3)',[tenant,wrong.delivery_id,{...snapshot,attachmentPath:`${tenant}/${randomUUID()}/fixture.pdf`}]);
    await assert.rejects(service('select public.notification_mail_attachment($1,$2)',[tenant,wrong.delivery_id]),e=>e.code==='42501');
   }finally{await db.query('rollback to savepoint mail_file_scope');}
  });
  await t.test('explicit document retry requeues only a confirmed failure without changing its frozen message',async()=>{
   await db.query('savepoint document_retry');
   try{
    const user=randomUUID(),invoice=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[user,`finance-${user}@example.test`]);
    await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot,finalized_at,pdf_storage_path) values($1,$2,$3,$4,'final','FIXTURE-NOTIFICATION',current_date,current_date+14,'{}','{}','[]',now(),$5)",[invoice,tenant,customer,user,`${tenant}/${invoice}/fixture.pdf`]);
    const job=(await service('select * from public.claim_mail_delivery($1,$2,$3,$4)',[tenant,recipient,'invoice',`fixture-retry-${invoice}`]))[0];
    await db.query("update public.mail_deliveries set render_snapshot=jsonb_build_object('invoice_id',$1::text) where id=$2",[invoice,job.delivery_id]);
    await service('select public.notification_mail_snapshot($1,$2,$3)',[tenant,job.delivery_id,snapshot]);
    await service('select public.notification_deferred_mail($1,$2,$3,$4)',['defer',tenant,job.delivery_id,{type:'invoice.available',context:'customer',available_at:new Date(Date.now()+3600000).toISOString()}]);
    await db.query("update private.notification_deferred_mail set state='failed',attempts=5 where mail_id=$1",[job.delivery_id]);await db.query("update public.mail_deliveries set status='failed' where id=$1",[job.delivery_id]);
    const retry=async(t=tenant)=>(await service("select public.notification_deferred_mail('retry',$1,$2) result",[t,job.delivery_id]))[0].result.ok;
    assert.equal(await retry(other),false);assert.equal(await retry(),true);assert.equal(await retry(),false);
    assert.deepEqual((await sql("select render_snapshot->'delivery' value from public.mail_deliveries where id=$1",[job.delivery_id]))[0].value,snapshot);
    const jobs=(await service("select public.notification_deferred_mail('claim',$1) result",[tenant]))[0].result;assert.equal(jobs.filter(j=>j.id===job.delivery_id).length,1);
    await service('select public.notification_deferred_mail($1,$2,$3,$4)',['finish',tenant,job.delivery_id,{lease_id:jobs.find(j=>j.id===job.delivery_id).lease_id,outcome:'uncertain'}]);
    assert.equal(await retry(),false);
   }finally{await db.query('rollback to savepoint document_retry');}
  });
 } finally {await db.query('rollback');await db.end();}
});
