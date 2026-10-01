import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {workOrderTestDatabase, localWorkOrderTestUrl} from './work-order-test-target.mjs';

test('resource identity and finalized evidence cannot transfer authorization',async t=>{
 const db=await workOrderTestDatabase();
 const [tenant,manager,planner,finance,portal,worker,ownPerson,otherPerson,customer,otherCustomer,boundObject,unusedObject,invoiceObject,otherInvoiceObject,document]=Array.from({length:15},()=>randomUUID());
 const users=[manager,planner,finance,portal,worker],sessions=new Map(users.map(u=>[u,randomUUID()]));
 const call=async(sql,args=[],actor=manager)=>{
  await db.query('savepoint actor_call');try{
   await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:sessions.get(actor)})]);
   const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint actor_call');return r.rows;
  }catch(e){await db.query('rollback to savepoint actor_call');await db.query('release savepoint actor_call');throw e;}
 };
 const check=(name,run)=>t.test(name,async()=>{await db.query('savepoint scenario');try{await run();}finally{await db.query('rollback to savepoint scenario');await db.query('release savepoint scenario');}});
 const modules=async enabled=>{await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await db.query('update public.tenant_settings set enabled_services=$1 where tenant_id=$2',[enabled,tenant]);await db.query("select set_config('request.jwt.claims','{}',true)");};
 try{
  await db.query('begin');
  for(const u of users){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[u,`${u}@resource-security.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions.get(u),u]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS resource lifecycle')",[tenant,`resource-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[tenant]);
  for(const [u,roles] of [[manager,['tenant_admin','management','hr']],[planner,['planner','staff']],[finance,['finance']],[worker,['staff']]])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",[tenant,u,roles]);
  for(const [id,u] of [[ownPerson,planner],[otherPerson,worker]])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS employee')",[id,tenant,u]);
  for(const id of [customer,otherCustomer])await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS customer')",[id,tenant,`C-${id}`]);
  for(const id of [boundObject,unusedObject,invoiceObject,otherInvoiceObject])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS object','{}')",[id,tenant,customer,`O-${id}`]);
  for(const obj of [boundObject,invoiceObject])await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,created_by) values($1,$2,$3,true,$4)',[tenant,obj,portal,manager]);
  await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,visibility,storage_path,file_name,mime_type,size_bytes,sha256,created_by) values($1,$2,$3,'FICTITIOUS OTHER CUSTOMER DOCUMENT','internal',$4,'FICTITIOUS.pdf','application/pdf',12,$5,$6)",[document,tenant,otherCustomer,`${tenant}/${otherCustomer}/${randomUUID().replaceAll('-','')}.pdf`,'a'.repeat(64),manager]);

  await check('an object binding cannot silently become access to another customer',async()=>{
   const documents=()=>call('select public.customer_portal_documents($1) data',[tenant],portal).then(r=>r[0].data.documents);
   assert.equal((await documents()).length,0);
   await assert.rejects(call('select public.customer_file_access($1,$2,$3)',[tenant,document,'document'],portal),e=>e.code==='42501');
   await assert.rejects(call('update public.objects set customer_id=$1 where id=$2',[otherCustomer,boundObject],planner),e=>e.code==='23514');
   assert.equal((await documents()).length,0);assert.equal((await db.query('select customer_id from public.objects where id=$1',[boundObject])).rows[0].customer_id,customer);
   await call('update public.objects set customer_id=$1 where id=$2',[otherCustomer,unusedObject],planner);
   assert.equal((await db.query('select customer_id from public.objects where id=$1',[unusedObject])).rows[0].customer_id,otherCustomer);
   await db.query('update public.object_customer_bindings set active=false where object_id=$1',[boundObject]);
   await assert.rejects(call('update public.objects set customer_id=$1 where id=$2',[otherCustomer,boundObject],planner),e=>e.code==='23514');
  });
  await check('private departure rows cannot move to another person or be edited/deleted by a planner',async()=>{
   const address={street:'FICTITIOUS PRIVATE DEPARTURE',city:'FICTITIOUS',country:'NL',status:'manual'};
   await call("insert into public.personnel_travel_days(tenant_id,personnel_id,day,standard_vehicle,departure_address,updated_by) values($1,$2,'2031-01-02','car',$3,$4)",[tenant,otherPerson,address,manager]);
   const original=(await db.query("select departure_address from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson])).rows[0].departure_address;
   await assert.rejects(call("select public.travel_day_departure($1,$2,'2031-01-02')",[tenant,otherPerson],planner),e=>e.code==='42501');
   await assert.rejects(call("update public.personnel_travel_days set personnel_id=$1 where tenant_id=$2 and personnel_id=$3 and day='2031-01-02'",[ownPerson,tenant,otherPerson],planner),e=>e.code==='23514');
   await assert.rejects(call("update public.personnel_travel_days set departure_address=null where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson],planner),e=>e.code==='42501');
   await assert.rejects(call("delete from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson],planner),e=>e.code==='42501');
   await assert.rejects(call("update public.personnel_travel_days set day='2031-01-03' where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson],manager),e=>e.code==='23514');
   await call("update public.personnel_travel_days set standard_vehicle='bicycle' where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson],planner);
   await call("update public.personnel_travel_days set standard_vehicle=null,departure_kind=null,departure_depot_id=null,return_to_departure=null where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson],planner);
   assert.deepEqual((await call("select public.travel_day_departure($1,$2,'2031-01-02') address",[tenant,otherPerson]))[0].address,original);
   assert.equal((await call("select public.travel_day_departure($1,$2,'2031-01-02') address",[tenant,ownPerson],planner))[0].address,null);
   await call("delete from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day='2031-01-02'",[tenant,otherPerson]);
  });
  await check('archival cannot bypass the dedicated customer command via a normal update',async()=>{
   const empty=randomUUID();
   await db.query("insert into public.customers(id,tenant_id,customer_number,name,status) values($1,$2,$3,'FICTITIOUS archived customer','archived')",[empty,tenant,`C-${empty}`]);
   for(const actor of [planner,finance])await assert.rejects(call('delete from public.customers where id=$1',[empty],actor),e=>e.code==='42501');
   await call('delete from public.customers where id=$1',[empty]);
   for(const actor of [planner,finance])await assert.rejects(call("update public.customers set status='archived' where id=$1",[customer],actor),e=>e.code==='42501');
   await call("update public.customers set name='FICTITIOUS updated profile' where id=$1",[customer],planner);
   await call("update public.customers set status='archived' where id=$1",[customer]);
   await assert.rejects(call("update public.customers set status='active' where id=$1",[customer],planner),e=>e.code==='42501');
   await call("update public.customers set status='active' where id=$1",[customer]);
  });
  await check('final invoice lines cannot be deleted or moved to widen customer document scope',async()=>{
   const invoice=randomUUID(),draft=randomUUID(),lines=[];
   for(const id of [invoice,draft])await db.query('insert into public.invoices(id,tenant_id,customer_id,created_by) values($1,$2,$3,$4)',[id,tenant,customer,manager]);
   for(const obj of [invoiceObject,otherInvoiceObject]){
    const order=randomUUID(),task=randomUUID(),line=randomUUID();lines.push(line);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by) values($1,$2,$3,$4,$5,'FICTITIOUS','planned',$6)",[order,tenant,customer,obj,`W-${order}`,manager]);
    await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,executed_quantity,unit,unit_price_cents,vat_basis_points,completed_at,execution_state) values($1,$2,$3,'FIX','FICTITIOUS execution',15,2,2,'stuk',100,2100,now(),'completed')",[task,tenant,order]);
    await db.query("update public.work_orders set status='invoice_ready',planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour' where id=$1",[order]);
    await db.query("insert into public.invoice_lines(id,tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents) values($1,$2,$3,$4,$5,'FICTITIOUS partial allocation',1,'stuk',100,0,2100,0,0)",[line,tenant,invoice,order,task]);
   }
   await db.query("update public.invoices set status='sent',invoice_number=$2,issued_on=current_date,due_on=current_date+30,customer_snapshot='{}',branding_snapshot='{}',finalized_at=now(),lines_snapshot='[{\"description\":\"FICTITIOUS immutable two-object evidence\"}]' where id=$1",[invoice,`I-${invoice}`]);
   const canRead=()=>call('select private.customer_invoice_access($1,$2) allowed',[tenant,invoice],portal).then(r=>r[0].allowed);
   assert.equal(await canRead(),false);
   await assert.rejects(call('delete from public.invoice_lines where id=$1',[lines[1]],finance),e=>e.code==='23514');
   await assert.rejects(call('update public.invoice_lines set invoice_id=$1 where id=$2',[draft,lines[1]],finance),e=>e.code==='23514');
   await assert.rejects(call('delete from public.invoices where id=$1',[invoice],finance),e=>e.code==='23514');
   assert.equal(await canRead(),false);assert.equal((await db.query('select count(*)::int n from public.invoice_lines where invoice_id=$1',[invoice])).rows[0].n,2);
   await call('delete from public.invoices where id=$1',[draft],finance);
  });
  await check('disabled finance prevents historical invoice and manual-payment replay',async()=>{
   const invoice=randomUUID(),key=`manual-${randomUUID()}`;
   await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,finalized_at,subtotal_cents,total_cents,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot) values($1,$2,$3,$4,'final',now(),1000,1000,$5,current_date,current_date+30,'{}','{}','[]')",[invoice,tenant,customer,manager,`I-${invoice}`]);
   const pay=()=>call("select (public.register_manual_payment($1,now(),'FICTITIOUS receipt',$2,$3)).id id",[tenant,JSON.stringify([{invoice_id:invoice,amount_cents:100}]),key],finance);
   const id=(await pay())[0].id;assert.equal((await pay())[0].id,id);
   await modules(['planning','personeel','rapportage']);
   assert.equal((await call('select id from public.invoices where id=$1',[invoice],finance)).length,0);
   await assert.rejects(call('select public.finalize_invoice($1)',[invoice],finance),e=>e.code==='42501');await assert.rejects(pay(),e=>e.code==='42501');
  });
  await check('customer commercial reads and replies require the current planning entitlement',async()=>{
   const request=randomUUID();
   await db.query("insert into public.requests(id,tenant_id,customer_id,object_id,request_number,discipline,description,status,created_by) values($1,$2,$3,$4,$5,'FICTITIOUS','FICTITIOUS original question','new',$6)",[request,tenant,customer,boundObject,`R-${request}`,manager]);
   const list=()=>call('select public.commercial_customer_list($1,1) data',[tenant],portal).then(r=>r[0].data);
   assert(JSON.stringify(await list()).includes(request));
   await modules(['personeel','rapportage','finance']);
   assert.equal(JSON.stringify(await list()).includes(request),false);
   await assert.rejects(call('select public.commercial_customer_action($1,$2,$3,$4)',[tenant,randomUUID(),'reply',{id:request,body:'FICTITIOUS blocked reply'}],portal),e=>e.code==='42501');
  });
 }finally{await db.query('rollback');await db.end();}
});

test('invoice payment and object binding maintain safe concurrent lifecycles',async()=>{
 // This concurrency fixture must commit; it is never permitted against staging.
 localWorkOrderTestUrl();
 const db=await workOrderTestDatabase(),a=await workOrderTestDatabase(),b=await workOrderTestDatabase();
 const [tenant,actor,session,customer,invoice]=Array.from({length:5},()=>randomUUID());
 let retry;
 try{
  await db.query('begin');
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@invoice-lock.test`]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS invoice lock')",[tenant,`invoice-lock-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['finance','planning'])",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','finance']::public.app_role[],'active')",[tenant,actor]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'LOCK','FICTITIOUS customer')",[customer,tenant]);
  await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,finalized_at,subtotal_cents,total_cents,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot) values($1,$2,$3,$4,'final',now(),1000,1000,'LOCK',current_date,current_date+30,'{}','{}','[]')",[invoice,tenant,customer,actor]);
  await db.query('commit');
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  for(const connection of [a,b]){
   await connection.query('begin');await connection.query('set local role authenticated');
   await connection.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
  }
  // Pause at the same row-lock boundary used by register_manual_payment.
  await a.query('select id from public.invoices where id=$1 for update',[invoice]);
  retry=b.query('select (public.finalize_invoice($1)).id id',[invoice]).then(value=>({value}),error=>({error}));
  let waiting=false;
  for(let attempt=0;attempt<100;attempt++){
   waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting===true;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert(waiting,'the finalization retry must be waiting on the existing invoice row');
  await a.query("select public.register_manual_payment($1,now(),'FICTITIOUS concurrency',$2,$3)",[tenant,JSON.stringify([{invoice_id:invoice,amount_cents:100}]),`lock-${tenant}`]);
  await a.query('commit');
  const result=await retry;if(result.error)throw result.error;
  assert.equal(result.value.rows[0].id,invoice);await b.query('commit');
  assert.equal((await db.query('select paid_cents::int paid from public.invoices where id=$1',[invoice])).rows[0].paid,100);
  const secondCustomer=randomUUID();
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'LOCK-2','FICTITIOUS second customer')",[secondCustomer,tenant]);
  for(const path of ['rpc','direct']){
   const object=randomUUID();
   await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS binding race','{}')",[object,tenant,customer,`O-${object}`]);
   for(const connection of [a,b]){
    await connection.query('begin');await connection.query('set local role authenticated');
    await connection.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
   }
   if(path==='rpc')await a.query('select public.bind_object_customer($1,$2,$3,true,false)',[tenant,object,`${actor}@invoice-lock.test`]);
   else await a.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,active) values($1,$2,$3,true)',[tenant,object,actor]);
   retry=b.query('update public.objects set customer_id=$1 where id=$2',[secondCustomer,object]).then(value=>({value}),error=>({error}));
   waiting=false;
   for(let attempt=0;attempt<100;attempt++){
    waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting===true;
    if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert(waiting,`${path} binding must serialize the customer change`);
   await a.query('commit');
   const reassignment=await retry;assert.equal(reassignment.error?.code,'23514');await b.query('rollback');
   assert.equal((await db.query('select customer_id from public.objects where id=$1',[object])).rows[0].customer_id,customer);
  }
 }finally{
  await Promise.all([a.query('rollback'),b.query('rollback')]);if(retry)await retry;
  await db.query('rollback');
  try{
   await db.query('begin');
   await db.query('delete from public.payment_allocations where tenant_id=$1',[tenant]);
   await db.query('delete from public.payment_attempts where tenant_id=$1',[tenant]);
   await db.query('delete from public.invoices where tenant_id=$1',[tenant]);
   await db.query('delete from public.object_customer_bindings where tenant_id=$1',[tenant]);
   await db.query('delete from public.object_history where tenant_id=$1',[tenant]);
   await db.query('delete from public.objects where tenant_id=$1',[tenant]);
   await db.query('delete from public.audit_events where tenant_id=$1',[tenant]);
   await db.query('delete from public.tenants where id=$1',[tenant]);
   await db.query('delete from auth.sessions where user_id=$1',[actor]);
   await db.query('delete from auth.users where id=$1',[actor]);
   await db.query('commit');
  }finally{await Promise.allSettled([db.end(),a.end(),b.end()]);}
 }
});
