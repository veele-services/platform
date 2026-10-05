import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { localWorkOrderTestUrl } from './work-order-test-target.mjs';

// Committed fixtures are required so three real database sessions can observe
// a revocation while another command waits. This helper refuses hosted targets.
test('waiting customer payments recheck authorization before reservations and receipt replay',async t=>{
 const connectionString=localWorkOrderTestUrl();
 const db=new pg.Client({connectionString}),blocker=new pg.Client({connectionString}),actor=new pg.Client({connectionString});
 await Promise.all([db.connect(),blocker.connect(),actor.connect()]);
 const tenant=randomUUID(),user=randomUUID(),session=randomUUID(),customer=randomUUID(),object=randomUUID(),invoice=randomUUID(),order=randomUUID(),task=randomUUID();
 const profile=`pfl_${randomUUID().replaceAll('-','')}`;let account;
 const args=command=>[tenant,account,[invoice],command,'test',profile];
 const query='select public.customer_portal_payment_prepare($1,$2,$3,$4,$5,$6) id';
 const beginActor=async()=>{
  await actor.query('begin');await actor.query("set local statement_timeout='8s'");await actor.query('set local role authenticated');
  await actor.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:session,role:'authenticated'})]);
 };
 const pid=Number((await actor.query('select pg_backend_pid() pid')).rows[0].pid);
 const waitUntilBlocked=async()=>{
  const until=Date.now()+4000;
  while(Date.now()<until){
   const row=(await db.query("select wait_event_type,query from pg_stat_activity where pid=$1",[pid])).rows[0];
   if(row?.wait_event_type==='Lock'&&row.query===query)return;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Payment preparation did not reach the deliberately held database lock');
 };
 const reservations=async()=>Number((await db.query('select count(*) n from public.payment_allocations where tenant_id=$1',[tenant])).rows[0].n);
 const blockedDenied=async({command=randomUUID(),lock='command',revoke,restore})=>{
  const before=await reservations();await blocker.query('begin');
  try{
   if(lock==='command')await blocker.query("select pg_advisory_xact_lock(hashtextextended('customer-payment-command:'||$1::text,0))",[command]);
   else await blocker.query('select 1 from public.invoices where id=$1 for update',[invoice]);
   await beginActor();
   // Capture rejection immediately so the test process cannot emit an unhandled
   // rejection while the controlling session releases the lock.
   const pending=actor.query(query,args(command)).then(result=>({result}),error=>({error}));
   try{
    await waitUntilBlocked();await revoke();await blocker.query('commit');
    const outcome=await pending;assert.equal(outcome.error?.code,'42501','Revoked preparation must fail closed');
   }finally{await actor.query('rollback');}
   assert.equal(await reservations(),before,'Revoked preparation created a reservation');
  }finally{await blocker.query('rollback');await restore();}
 };
 try{
  await db.query('begin');
  await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[user,`${user}@payment-concurrency.invalid`]);
  await db.query('insert into auth.sessions(id,user_id,created_at,updated_at)values($1,$2,now(),now())',[session,user]);
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,'FICTITIOUS concurrency supplier')",[tenant,`payment-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['finance','planning'])",[tenant]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name)values($1,$2,$1::uuid::text,'FICTITIOUS concurrency customer')",[customer,tenant]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,$1::uuid::text,'FICTITIOUS concurrency object','{}')",[object,tenant,customer]);
  await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$3)',[tenant,object,user]);
  account=(await db.query('select id from public.customer_portal_accounts where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id;
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at)values($1,$2,$3,$4,$1::uuid::text,'Onderhoud','invoice_ready',$5,now(),now()+interval '1 hour',now(),now()+interval '1 hour')",[order,tenant,customer,object,user]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state)values($1,$2,$3,'FICTITIOUS','FICTITIOUS service',15,1,'stuk',10000,0,now(),1,'completed')",[task,tenant,order]);
  await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,subtotal_cents,total_cents)values($1,$2,$3,$4,'draft',$1::uuid::text,current_date,current_date+30,10000,10000)",[invoice,tenant,customer,user]);
  await db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)values($1,$2,$3,$4,'FICTITIOUS service',1,'stuk',10000,10000,0,0,10000)",[tenant,invoice,order,task]);
  await db.query("update public.invoices set status='sent',finalized_at=now(),customer_snapshot='{}',branding_snapshot='{}',lines_snapshot='[]' where id=$1",[invoice]);
  await db.query("insert into public.tenant_provider_connections(tenant_id,provider,mode,secret_reference,public_config,active,verified_at)values($1,'mollie','test','MOLLIE_API_KEY',$2,true,now())",[tenant,{profile_id:profile}]);
  await db.query('commit');
  await t.test('account revocation while waiting on command lock creates no reservation',()=>blockedDenied({
   revoke:()=>db.query('update public.customer_portal_accounts set active=false where id=$1',[account]),
   restore:()=>db.query('update public.customer_portal_accounts set active=true where id=$1',[account]),
  }));
  await t.test('object binding revocation while waiting on invoice lock creates no reservation',()=>blockedDenied({lock:'invoice',
   revoke:()=>db.query('update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2',[tenant,object]),
   restore:()=>db.query('update public.object_customer_bindings set active=true where tenant_id=$1 and object_id=$2',[tenant,object]),
  }));
  const command=randomUUID();await beginActor();await actor.query(query,args(command));await actor.query('commit');assert.equal(await reservations(),1);
  await t.test('merchant revocation while a receipt replay waits denies that replay',()=>blockedDenied({command,
   revoke:()=>db.query('update public.tenant_provider_connections set verified_at=null where tenant_id=$1',[tenant]),
   restore:()=>db.query('update public.tenant_provider_connections set verified_at=now() where tenant_id=$1',[tenant]),
  }));
 }finally{
  await Promise.all([actor.query('rollback'),blocker.query('rollback'),db.query('rollback')]);
  await db.query('begin');await db.query("set local session_replication_role='replica'");
  const tables=(await db.query("select distinct table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in('public','private')")).rows;
  for(const {table_schema:s,table_name:n}of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=$1`,[tenant]);
  await db.query('delete from public.tenants where id=$1',[tenant]);await db.query('delete from auth.sessions where id=$1',[session]);await db.query('delete from auth.users where id=$1',[user]);await db.query('commit');
  await Promise.all([db.end(),actor.end(),blocker.end()]);
 }
});
