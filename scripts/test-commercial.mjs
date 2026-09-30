import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

test('Commercial workflow: persisted prices, revisions, scope and transactional decisions', async t => {
 const local=JSON.parse(execFileSync('pnpm',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
 const url=new URL(local.DB_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'59322');
 const db=new pg.Client({connectionString:local.DB_URL});await db.connect();
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),staff=randomUUID(),session=randomUUID(),staffSession=randomUUID(),customer=randomUUID(),customer2=randomUUID(),object=randomUUID(),object2=randomUUID();
 const request=randomUUID(),quote=randomUUID();let nextQuote;
 const call=async(sql,args=[],user=manager,role='authenticated')=>{const c=new pg.Client({connectionString:local.DB_URL});await c.connect();try{await c.query('begin');await c.query("set local statement_timeout='15s'");await c.query(`set local role ${role}`);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:user===manager?session:staffSession,role})]);const r=await c.query(sql,args);await c.query('commit');return r.rows;}catch(e){await c.query('rollback');throw e;}finally{await c.end();}};
 const command=async(name,input,id=randomUUID())=>(await call('select public.commercial_command($1,$2,$3,$4) result',[tenant,id,name,input]))[0].result;
 const detail=async(id,kind='quote')=>(await call('select public.commercial_detail($1,$2,$3) result',[tenant,id,kind]))[0].result;
 const list=async(filters={})=>(await call('select public.commercial_list($1,$2) result',[tenant,filters]))[0].result;
 const line={id:randomUUID(),description:'FICTITIOUS service',quantity:'3.125',unit:'uur',price_cents:1299,discount_basis_points:750,vat_basis_points:900,duration_minutes:60};
 const input={id:quote,version:0,request_id:request,customer_id:customer,object_id:object,contact_id:'',owner_id:manager,subject:'FICTITIOUS offer',work_kind:'once',price_basis:'once',lines:[line,{...line,id:randomUUID(),quantity:'2',vat_basis_points:2100}],terms:{scope:'FICTITIOUS work scope',discipline:'Test',conditions:'Test conditions',secret_code:'NEVER EXPOSE'},expires_at:new Date(Date.now()+86400000*14).toISOString(),followup_on:'2026-01-01'};
 try{
  for(const [id,s] of [[manager,session],[staff,staffSession]]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@commercial.test`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[s,id]);}
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS commercial tenant')",[id,`commercial-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','finance','rapportage'])",[id]);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active')",[tenant,manager,staff]);
  for(const id of [customer,customer2])await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,$3,'FICTITIOUS customer','customer@commercial.test')",[id,tenant,`C-${id}`]);
  for(const [id,c] of [[object,customer],[object2,customer2]])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address,access_instructions) values($1,$2,$3,$4,'FICTITIOUS object','{\"street\":\"Teststraat 1\"}','PRIVATE DO NOT PUBLISH')",[id,tenant,c,`O-${id}`]);
  await t.test('request creates once, preserves original text, supports no object and rejects wrong relationships',async()=>{
   const payload={id:request,version:0,customer_id:customer,object_id:'',owner_id:manager,subject:'FICTITIOUS request',description:'Original customer wording',discipline:'Test',source:'phone',priority:'normal',work_kind:'once',next_action:'Object vaststellen'};
   await Promise.all([command('request_save',payload),command('request_save',payload)]);
   assert.equal((await list()).rows.filter(r=>r.id===request).length,1);
   await assert.rejects(command('request_save',{...payload,id:randomUUID(),object_id:object2}),e=>e.code==='23514');
   await command('request_save',{...payload,version:1,object_id:object,description:'Changed wording is ignored'});
   assert.equal((await detail(request,'request')).record.description,payload.description);
   await assert.rejects(command('request_save',{...payload,version:1}),e=>e.code==='40001');
  });
  await t.test('intake without object can attach its definitive object from either draft editor',async()=>{
   const payload={version:0,customer_id:customer,object_id:'',owner_id:manager,subject:'FICTITIOUS late object',description:'Original location unknown',discipline:'Test',source:'phone',priority:'normal',work_kind:'once',next_action:'Object vaststellen'};
   for(const via of ['request','quote']){
    const rid=randomUUID(),qid=randomUUID();await command('request_save',{...payload,id:rid});
    await command('quote_save',{...input,id:qid,request_id:rid,object_id:''});
    if(via==='request')await command('request_save',{...payload,id:rid,version:1,object_id:object});
    else await command('quote_save',{...input,id:qid,version:1,request_id:rid,object_id:object});
    assert.equal((await detail(rid,'request')).record.object_id,object);assert.equal((await detail(qid)).record.object_id,object);
   }
  });
  await t.test('unused drafts can be deleted; dependent requests must retain their history',async()=>{
   const rid=randomUUID(),qid=randomUUID();const payload={id:rid,version:0,customer_id:customer,object_id:object,owner_id:manager,subject:'FICTITIOUS draft',description:'Unused test question',discipline:'Test',source:'phone',priority:'normal',work_kind:'once',next_action:'Beoordelen'};
   await command('request_save',payload);await command('quote_save',{...input,id:qid,request_id:rid});
   await assert.rejects(command('request_delete',{id:rid,version:1}),e=>e.code==='23514');
   await command('quote_delete',{id:qid,version:1});await command('request_delete',{id:rid,version:1});
   assert.equal((await db.query('select count(*) from public.requests where id=$1',[rid])).rows[0].count,'0');
   const sentId=randomUUID();await command('request_save',{...payload,id:sentId});
   const event=(await db.query("select id from public.commercial_events where request_id=$1 and kind='request.received'",[sentId])).rows[0];
   const claimed=(await call('select public.commercial_mail_claim($1,$2,$3) result',[tenant,event.id,'customer@commercial.test'],manager,'service_role'))[0].result;
   assert.equal(claimed.send,true);
   await assert.rejects(command('request_delete',{id:sentId,version:1}),e=>e.code==='23514');
   await db.query("update public.mail_deliveries set status='sent',sent_at=now() where id=$1",[claimed.id]);
   await assert.rejects(command('request_delete',{id:sentId,version:1}),e=>e.code==='23514');
   await command('request_archive',{id:sentId,version:1});
   assert.equal((await detail(sentId,'request')).deliveries[0].status,'sent');
  });
  await t.test('draft prices use decimal line discounts and VAT groups; no universal VAT; draft revisions CAS',async()=>{
   await command('quote_save',input);const d=await detail(quote);assert.equal(d.record.subtotal_cents,6158);assert.equal(d.record.vat_cents,843);assert.equal(d.record.total_cents,7001);
   assert.equal(d.record.terms.secret_code,undefined);assert.equal(d.record.status,'draft');
   await assert.rejects(command('quote_save',{...input,id:randomUUID()}),e=>e.code==='23514');
  });
  await t.test('publication freezes safe data, GET does not decide, replacement invalidates only open versions',async()=>{
   await command('publish',{id:quote,version:1});const d=await detail(quote);
   assert.equal(d.record.status,'awaiting_acceptance');assert.equal(d.record.sent_at,null);
   assert.ok(!JSON.stringify(d.record.snapshot).includes('PRIVATE'));assert.ok(!JSON.stringify(d.record.snapshot).includes('NEVER EXPOSE'));
   assert.equal(d.record.snapshot.customer.name,'FICTITIOUS customer');
   await db.query("update public.customers set name='Changed current customer' where id=$1",[customer]);
   assert.equal((await detail(quote)).record.snapshot.customer.name,'FICTITIOUS customer');
   await assert.rejects(db.query("update public.quotes set subject='Rewrite history' where id=$1",[quote]),e=>e.code==='23514');
   nextQuote=(await command('revise',{id:quote,version:d.record.version})).id;
   assert.equal((await detail(nextQuote)).record.revision,2);
   await command('publish',{id:nextQuote,version:1});assert.ok((await detail(quote)).record.superseded_at);
   await assert.rejects(command('decide',{id:quote,version:(await detail(quote)).record.version,decision:'accepted',name:'Fictitious Approver',channel:'email',evidence:'Original e-mail in test dossier',received_at:new Date().toISOString(),confirmed:true}),e=>e.code==='23514');
  });
  await t.test('manual acceptance requires evidence and exact version; repeated conversion creates one real backlog work order',async()=>{
   const q=(await detail(nextQuote)).record;
   await assert.rejects(command('decide',{id:q.id,version:q.version,decision:'accepted',name:'Fictitious Approver',channel:'email',confirmed:true}),e=>e.code==='23514');
   await command('decide',{id:q.id,version:q.version,decision:'accepted',name:'Fictitious Approver',channel:'email',confirmed:true,evidence:'Fictitious written acceptance',received_at:new Date().toISOString()});
   const accepted=(await detail(nextQuote)).record;assert.ok(accepted.accepted_at);assert.equal(JSON.parse(accepted.acceptance_evidence).revision,2);
   const [a,b]=await Promise.all([command('convert',{id:q.id,version:accepted.version}),command('convert',{id:q.id,version:accepted.version})]);assert.equal(a.operation_id,b.operation_id);
   const orders=(await db.query('select * from public.work_orders where quote_id=$1',[q.id])).rows;assert.equal(orders.length,1);assert.equal(orders[0].projected_start_at,null);
   assert.equal((await db.query('select count(*) from public.work_order_tasks where work_order_id=$1',[orders[0].id])).rows[0].count,'2');
   assert.equal((await list({tab:'quotes'})).counts.convert,0);assert.equal((await list({tab:'quotes'})).rows.find(x=>x.id===q.id).next_action,'Inplannen');
  });

  await t.test('the request wizard creates one ordinary prospect and contact atomically on retry',async()=>{
   const id=randomUUID(),payload={id,version:0,customer_id:'',object_id:'',owner_id:manager,subject:'Fictitious prospect intake',description:'Original intake wording',discipline:'Test',source:'email',priority:'normal',work_kind:'once',next_action:'Object vaststellen',prospect:{name:'Fictitious new prospect',email:'prospect@commercial.test',contact:'Fictitious contact',phone:''}};
   const [a,b]=await Promise.all([command('request_save',payload),command('request_save',payload)]);assert.equal(a.customer_id,b.customer_id);assert.equal(a.contact_id,b.contact_id);
   assert.equal((await db.query('select status from public.customers where id=$1',[a.customer_id])).rows[0].status,'lead');
   assert.equal((await detail(id,'request')).record.contact_id,a.contact_id);
  });
  await t.test('public intake is persistent, retry-safe, private and never merges a guessed customer',async()=>{
   const id=randomUUID();const payload={name:'FICTITIOUS customer',email:'customer@commercial.test',phone:'',subject:'Fictitious website intake',description:'Original public question',discipline:'Test',work_kind:'once'};
   const hash=createHash('sha256').update('fictional-client').digest('hex');
   const submit=()=>call('select public.commercial_public_intake($1,$2,$3,$4)',[tenant,id,payload,hash],manager,'service_role');
   await Promise.all([submit(),submit()]);
   const saved=(await db.query('select * from public.requests where id=$1',[id])).rows[0];assert.notEqual(saved.customer_id,customer);assert.equal(saved.object_id,null);assert.equal(saved.source,'website');
   const prospect=(await db.query('select status from public.customers where id=$1',[saved.customer_id])).rows[0];assert.equal(prospect.status,'lead');
   assert.equal((await db.query('select count(*) from public.requests where id=$1',[id])).rows[0].count,'1');
   const q=randomUUID();await command('quote_save',{...input,id:q,request_id:id,customer_id:saved.customer_id,object_id:''});await assert.rejects(command('publish',{id:q,version:1}),e=>e.code==='23514');
   await assert.rejects(call('select public.commercial_public_intake($1,$2,$3,$4)',[tenant,randomUUID(),payload,hash]),e=>e.code==='42501');
   for(let i=0;i<4;i++)await call('select public.commercial_public_intake($1,$2,$3,$4)',[tenant,randomUUID(),payload,hash],manager,'service_role');
   await assert.rejects(call('select public.commercial_public_intake($1,$2,$3,$4)',[tenant,randomUUID(),payload,hash],manager,'service_role'),e=>e.code==='23514');
  });
  await t.test('portal bindings isolate requests, decisions and public documents from other customer objects',async()=>{
   await call('insert into public.object_customer_bindings(tenant_id,object_id,user_id) values($1,$2,$3)',[tenant,object,staff]);
   const id=randomUUID();const payload={object_id:object,subject:'Fictitious portal intake',description:'Portal original wording',discipline:'Test',work_kind:'once'};
   await call("select public.commercial_customer_action($1,$2,'intake',$3)",[tenant,id,payload],staff);
   const saved=(await db.query('select * from public.requests where id=$1',[id])).rows[0];assert.equal(saved.customer_id,customer);assert.equal(saved.created_by,staff);
   await assert.rejects(call("select public.commercial_customer_action($1,$2,'intake',$3)",[tenant,randomUUID(),{...payload,object_id:object2}],staff),e=>e.code==='42501');
   await command('information',{id,version:saved.version,reason:'Please clarify the public scope',followup_on:'2026-10-01'});
   const portal=(await call('select public.commercial_customer_list($1,1) result',[tenant],staff))[0].result;
   assert.ok(!JSON.stringify(portal).includes('PRIVATE DO NOT PUBLISH'));assert.ok(portal.requests.some(r=>r.id===id));assert.ok(!portal.objects.some(o=>o.id===object2));
   await call("select public.commercial_customer_action($1,$2,'reply',$3)",[tenant,randomUUID(),{id,body:'Requested public clarification'}],staff);
   assert.equal((await detail(id,'request')).record.status,'review');
   await assert.rejects(call("select public.commercial_customer_file($1,$2,'pdf')",[other,nextQuote],staff),e=>e.code==='42501');
   await call('update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3',[tenant,object,staff]);
   assert.equal((await call('select public.commercial_customer_list($1,1) result',[tenant],staff))[0].result.quotes.length,0);
  });
  await t.test('external version decisions require a conscious action, expiry and replay are enforced',async()=>{
   const q=randomUUID();await command('quote_save',{...input,id:q,request_id:'',subject:'Fictitious secure offer'});await command('publish',{id:q,version:1});
   const hash=createHash('sha256').update(randomUUID()).digest('hex');
   await db.query("insert into public.external_action_tokens(tenant_id,purpose,subject_id,token_hash,expires_at,recipient) values($1,'quote_acceptance',$2,$3,now()+interval '1 day','customer@commercial.test')",[tenant,q,hash]);
   await detail(q);assert.equal((await detail(q)).record.status,'awaiting_acceptance');
   const payload={name:'Fictitious Customer',decision:'accepted',confirmed:true};
   await assert.rejects(call('select public.commercial_external_decision($1,$2,$3)',[hash,other,payload],manager,'service_role'),e=>e.code==='23514');
   await assert.rejects(call('select public.commercial_external_decision($1,$2,$3)',[hash,tenant,{...payload,confirmed:false}],manager,'service_role'),e=>e.code==='23514');
   const decide=()=>call('select public.commercial_external_decision($1,$2,$3)',[hash,tenant,payload],manager,'service_role');await Promise.all([decide(),decide()]);
   assert.equal((await db.query("select count(*) from public.commercial_events where quote_id=$1 and kind='quote.accepted'",[q])).rows[0].count,'1');
   await assert.rejects(call('select public.commercial_external_decision($1,$2,$3)',[hash,tenant,{...payload,decision:'rejected',evidence:'Different second answer'}],manager,'service_role'),e=>e.code==='23514');
   const revised=await command('revise',{id:q,version:(await detail(q)).record.version});assert.equal((await detail(q)).record.status,'accepted');
   await command('publish',{id:revised.id,version:1});assert.equal((await detail(q)).record.superseded_at,null);
   const oldHash=createHash('sha256').update(randomUUID()).digest('hex');await db.query("insert into public.external_action_tokens(tenant_id,purpose,subject_id,token_hash,expires_at) values($1,'quote_acceptance',$2,$3,now()-interval '1 second')",[tenant,revised.id,oldHash]);
   await assert.rejects(call('select public.commercial_external_decision($1,$2,$3)',[oldHash,tenant,payload],manager,'service_role'),e=>e.code==='23514');
  });
  await t.test('mail claims never replay uncertain sends and track a provider acceptance separately',async()=>{
   const q=randomUUID();await command('quote_save',{...input,id:q,request_id:''});await command('publish',{id:q,version:1});await db.query("update public.quotes set pdf_path='FICTITIOUS-PRIVATE-PATH' where id=$1",[q]);
   const claim=()=>call('select public.commercial_quote_mail_claim($1,$2,$3,false) result',[tenant,q,randomUUID()],manager,'service_role');
   const results=await Promise.all([claim(),claim()]);assert.equal(results.filter(r=>r[0].result.send).length,1);const id=results.find(r=>r[0].result.send)[0].result.id;
   await db.query("update public.mail_deliveries set locked_until=now()-interval '1 day' where id=$1",[id]);assert.equal((await claim())[0].result.send,false);
   await call('select public.commercial_quote_mail_finish($1,$2,$3,$4)',[tenant,id,'fictional-provider-reference',manager],manager,'service_role');
   assert.ok((await detail(q)).record.sent_at);assert.equal((await detail(q)).record.status,'awaiting_acceptance');assert.equal((await detail(q)).deliveries[0].status,'sent');
  });
  await t.test('approved execution invoices preserve accepted discount and grouped VAT exactly',async()=>{
   const q=(await detail(nextQuote)).record;const w=q.operation_id;const tasks=(await db.query('select * from public.work_order_tasks where work_order_id=$1 order by id',[w])).rows;
   await assert.rejects(db.query('update public.work_order_tasks set unit_price_cents=unit_price_cents+1 where id=$1',[tasks[0].id]),e=>e.code==='23514');
   await db.query("update public.work_orders set planned_start_at=now()-interval '1 hour',planned_end_at=now()+interval '1 hour',projected_start_at=now()-interval '1 hour',projected_end_at=now()+interval '1 hour',status='in_progress' where id=$1",[w]);
   for(const task of tasks)await call("select public.record_task_execution($1,$2,1,'completed',$3,'Fictitious completed work')",[tenant,task.id,task.quantity]);
   await db.query("update public.work_orders set status='completed' where id=$1",[w]);await call("select public.review_work_order($1,'approved',null)",[w]);
   const invoice=(await call('select (public.create_execution_invoice($1,$2,$3)).*',[tenant,randomUUID(),JSON.stringify(tasks.map(t=>({taskId:t.id,quantity:t.quantity}))) ]))[0];
   assert.equal(Number(invoice.subtotal_cents),q.subtotal_cents);assert.equal(Number(invoice.vat_cents),q.vat_cents);assert.equal(Number(invoice.total_cents),q.total_cents);
   const billed=(await db.query('select description from public.invoice_lines where invoice_id=$1',[invoice.id])).rows;assert.ok(billed.every(l=>(l.description.match(/korting/g)||[]).length===1));
  });
  await t.test('recurrence preserves frequency, creates explicit visits and bills the full period only once',async()=>{
   const id=randomUUID();const terms={...input.terms,frequency:'Three visits each week',starts_on:'2026-08-01',ends_on:'2026-10-31',pricing_method:'fixed'};
   await command('quote_save',{...input,id,request_id:'',work_kind:'recurring',price_basis:'month',terms});await command('publish',{id,version:1});
   await command('decide',{id,version:2,decision:'accepted',name:'Fictitious Approver',channel:'email',confirmed:true,evidence:'Written acceptance of periodic price',received_at:new Date().toISOString()});
   const converted=await command('convert',{id,version:3});
   const visits=await Promise.all([call('select public.commercial_next_visit($1,$2,$3,$4) id',[tenant,id,'2026-08-04',randomUUID()]),call('select public.commercial_next_visit($1,$2,$3,$4) id',[tenant,id,'2026-08-04',randomUUID()])]);assert.equal(visits[0][0].id,visits[1][0].id);
   const w=converted.operation_id;await db.query("update public.work_orders set planned_start_at='2026-08-01T08:00:00Z',planned_end_at='2026-08-01T14:00:00Z',projected_start_at='2026-08-01T08:00:00Z',projected_end_at='2026-08-01T14:00:00Z',status='in_progress' where id=$1",[w]);
   const tasks=(await db.query('select * from public.work_order_tasks where work_order_id=$1',[w])).rows;
   for(const task of tasks)await call("select public.record_task_execution($1,$2,1,'completed',$3,'Fictitious monthly work')",[tenant,task.id,task.quantity]);
   await db.query("update public.work_orders set status='completed' where id=$1",[w]);await call("select public.review_work_order($1,'approved',null)",[w]);
   await assert.rejects(call('select public.create_execution_invoice($1,$2,$3)',[tenant,randomUUID(),JSON.stringify(tasks.map(t=>({taskId:t.id,quantity:t.quantity})))]),e=>e.code==='23514');
   const create=()=>call('select (public.create_commercial_period_invoice($1,$2,$3,$4,true)).*',[tenant,id,'2026-08-01',randomUUID()]);
   const invoices=await Promise.all([create(),create()]);assert.equal(invoices[0][0].id,invoices[1][0].id);assert.equal(Number(invoices[0][0].total_cents),(await detail(id)).record.total_cents);
   assert.equal((await db.query("select count(*) from public.object_records where details->>'commercial_quote_id'=$1",[id])).rows[0].count,'1');
   await assert.rejects(call('select public.commercial_next_visit($1,$2,$3,$4)',[tenant,id,'2026-11-01',randomUUID()]),e=>e.code==='23514');
  });
  await t.test('concurrent booking confirmations cannot oversubscribe and never accept paid work',async()=>{
   const first=randomUUID(),second=randomUUID(),slot=randomUUID(),tk1=randomUUID(),tk2=randomUUID();
   for(const id of [first,second])await command('request_save',{id,version:0,customer_id:customer,object_id:object,owner_id:manager,subject:'Fictitious capacity request',description:'Fictitious booking question',discipline:'Test',source:'phone',priority:'normal',work_kind:'once',next_action:'Opname plannen'});
   await db.query("insert into public.appointment_slots(id,tenant_id,starts_at,ends_at,capacity) values($1,$2,now()+interval '2 days',now()+interval '2 days 1 hour',1)",[slot,tenant]);
   for(const [tk,id] of [[tk1,first],[tk2,second]]){await db.query("insert into public.external_action_tokens(id,tenant_id,purpose,subject_id,token_hash,expires_at) values($1,$2,'booking',$3,$4,now()+interval '1 day')",[tk,tenant,id,createHash('sha256').update(tk).digest('hex')]);await db.query('insert into public.booking_options(tenant_id,token_id,slot_id) values($1,$2,$3)',[tenant,tk,slot]);}
   const book=(req,tk)=>call('select public.book_appointment_slot($1,$2,$3,$4)',[tenant,req,slot,tk],manager,'service_role');const results=await Promise.allSettled([book(first,tk1),book(second,tk2)]);
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await db.query('select booked_count from public.appointment_slots where id=$1',[slot])).rows[0].booked_count,1);assert.equal((await detail(first,'request')).record.status,'new');
  });
  await t.test('contextual booking cancellation revokes links and releases capacity once without undoing consent',async()=>{
   const req=randomUUID();await command('request_save',{id:req,version:0,customer_id:customer,object_id:object,owner_id:manager,subject:'Fictitious inspection',description:'Fictitious site visit',discipline:'Test',source:'phone',priority:'normal',work_kind:'once',next_action:'Opname plannen'});
   const inspection=await command('inspection',{id:req,version:1});const order=inspection.operation_id;assert.ok(order);
   const booking=(await call('select public.commercial_booking($1,$2,$3) result',[tenant,randomUUID(),{work_order_id:order,starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString(),capacity:1,token_hash:createHash('sha256').update(order).digest('hex')}]))[0].result;
   const slot=(await db.query('select slot_id from public.booking_options where token_id=$1',[booking.id])).rows[0].slot_id;
   await call('select public.book_appointment_slot($1,$2,$3,$4)',[tenant,req,slot,booking.id],manager,'service_role');
   const action=randomUUID();for(let i=0;i<2;i++)await call('select public.commercial_cancel_booking($1,$2,$3,$4)',[tenant,order,action,'Fictitious cancellation']);
   assert.equal((await db.query('select booked_count from public.appointment_slots where id=$1',[slot])).rows[0].booked_count,0);
   assert.ok((await db.query('select revoked_at from public.external_action_tokens where id=$1',[booking.id])).rows[0].revoked_at);
   await assert.rejects(call('select public.book_appointment_slot($1,$2,$3,$4)',[tenant,req,slot,booking.id],manager,'service_role'),e=>e.code==='42501');
  });
  await t.test('tenant and live session isolation, staff cannot read or mutate commercial source rows',async()=>{
   await assert.rejects(call('select public.commercial_list($1,$2)',[other,{}]),e=>e.code==='42501');
   await assert.rejects(call('select public.commercial_detail($1,$2,$3)',[tenant,quote,'quote'],staff),e=>e.code==='42501');
   assert.equal((await call('select id from public.quotes where tenant_id=$1',[tenant],staff)).length,0);
   await assert.rejects(call("update public.quotes set status='accepted' where id=$1",[quote]),e=>e.code==='42501');
   await db.query('delete from auth.sessions where id=$1',[session]);await assert.rejects(list(),e=>e.code==='42501');
  });
 }finally{
  // Isolated test fixtures only; existing project and tenant data are untouched.
  await db.query('begin');await db.query("set local session_replication_role='replica'");
  const tables=(await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private')")).rows;
  for(const {table_schema:s,table_name:n} of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=any($1::uuid[])`,[[tenant,other]]);
  await db.query('delete from public.tenants where id=any($1::uuid[])',[[tenant,other]]);await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[[manager,staff]]);await db.query('delete from auth.users where id=any($1::uuid[])',[[manager,staff]]);await db.query('commit');await db.end();
 }
});
