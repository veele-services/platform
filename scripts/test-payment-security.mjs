import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('payment provider evidence and issued customer capabilities cannot be rewritten by finance', async t => {
  const db=await workOrderTestDatabase(); await db.query('begin');
  const tenant=randomUUID(), actor=randomUUID(), session=randomUUID(), customer=randomUUID(), other=randomUUID(), invoice=randomUUID(), invoice2=randomUUID(), group=randomUUID(), attempt=randomUUID();
  const call=async(sql,args=[],role='authenticated')=>{
    await db.query('savepoint payment_call');
    try {
      await db.query(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor,session_id:session})]);
      const result=await db.query(sql,args);
      await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint payment_call');return result.rows;
    } catch(error) {await db.query('rollback to savepoint payment_call');throw error;}
  };
  const denied=async(sql,args)=>{await assert.rejects(call(sql,args),e=>['42501','23514'].includes(e.code));};
  try {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[actor,`${actor}@fictional-payment.test`]);
    await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[session,actor]);
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS payment security')",[tenant,`payment-${tenant}`]);
    await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['finance'])",[tenant]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['finance']::public.app_role[],'active')",[tenant,actor]);
    for (const [id,label] of [[customer,'A'],[other,'B']]) await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS customer')",[id,tenant,label]);
    for (const [id,c,label] of [[invoice,customer,'A'],[invoice2,other,'B']]) await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot,finalized_at,subtotal_cents,total_cents) values($1,$2,$3,$4,'final',$5,current_date,current_date+30,'{}','{}','[]',now(),10000,10000)",[id,tenant,c,actor,label]);
    await call("insert into public.invoice_groups(id,tenant_id,customer_id,purpose,created_by,expires_at) values($1,$2,$3,'payment_bundle',$4,now()+interval '1 day')",[group,tenant,customer,actor]);
    await call("insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id) values($1,$2,$3)",[tenant,group,invoice]);
    await db.query("insert into public.payment_attempts(id,tenant_id,invoice_group_id,provider,provider_payment_id,provider_mode,status,amount_cents,idempotency_key) values($1,$2,$3,'mollie','tr_fictional_payment','test','open',10000,$4)",[attempt,tenant,group,`mollie-${group}-10000`]);
    await db.query("insert into public.payment_allocations(tenant_id,payment_attempt_id,invoice_id,amount_cents) values($1,$2,$3,10000)",[tenant,attempt,invoice]);
    await t.test('finance can read provider evidence but cannot forge checkout, status or allocations',async()=>{
      assert.equal((await call('select id from public.payment_attempts where id=$1',[attempt]))[0].id,attempt);
      await denied("update public.payment_attempts set checkout_url='https://untrusted.example.invalid/',status='paid' where id=$1",[attempt]);
      await denied('update public.payment_allocations set invoice_id=$1 where payment_attempt_id=$2',[invoice2,attempt]);
      await denied('delete from public.payment_attempts where id=$1',[attempt]);
      await denied("insert into public.payment_attempts(tenant_id,provider,provider_mode,status,amount_cents,idempotency_key) values($1,'manual','manual','paid',100,$2)",[tenant,randomUUID()]);
      await denied('delete from public.payment_allocations where payment_attempt_id=$1',[attempt]);
      await denied('insert into public.payment_allocations(tenant_id,payment_attempt_id,invoice_id,amount_cents) values($1,$2,$3,100)',[tenant,attempt,invoice2]);
      assert.equal((await db.query('select status,checkout_url from public.payment_attempts where id=$1',[attempt])).rows[0].status,'open');
    });
    await t.test('payment summaries and finalized invoice identity cannot be edited outside the payment functions',async()=>{
      await denied("update public.invoices set paid_cents=10000,status='paid' where id=$1",[invoice]);
      await denied("update public.invoices set status='draft' where id=$1",[invoice]);
      assert.equal((await db.query('select paid_cents from public.invoices where id=$1',[invoice])).rows[0].paid_cents,'0');
      await call("update public.invoices set sent_at=now(),status='sent' where id=$1",[invoice]);
    });
    await t.test('a payment group cannot include a different customer invoice',async()=>{
      const unissued=randomUUID();
      await call("insert into public.invoice_groups(id,tenant_id,customer_id,purpose,created_by,expires_at) values($1,$2,$3,'payment_bundle',$4,now()+interval '1 day')",[unissued,tenant,customer,actor]);
      await denied('insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id) values($1,$2,$3)',[tenant,unissued,invoice2]);
      await call('insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id) values($1,$2,$3)',[tenant,unissued,invoice]);
    });
    await t.test('issued group identities and item membership are immutable, cancellation remains possible',async()=>{
      await db.query("insert into public.external_action_tokens(tenant_id,purpose,subject_id,token_hash,expires_at) values($1,'payment',$2,$3,now()+interval '1 day')",[tenant,group,'a'.repeat(64)]);
      await denied('update public.invoice_groups set customer_id=$1 where id=$2',[other,group]);
      await denied('delete from public.invoice_group_items where invoice_group_id=$1',[group]);
      await call("update public.invoice_groups set status='cancelled' where id=$1",[group]);
      assert.equal((await db.query('select count(*)::int n from public.invoice_group_items where invoice_group_id=$1',[group])).rows[0].n,1);
    });
    await t.test('provider settlement verifies identity, allocation totals and repeats only once, including expired or cancelled links',async()=>{
      const payload={id:'tr_fictional_payment',mode:'test',status:'paid',amount:{value:'100.00',currency:'EUR'},metadata:{tenant_id:tenant,payment_attempt_id:attempt,invoice_group_id:group}};
      const settle=(change={},args={})=>call('select (public.apply_confirmed_provider_payment($1,$2,$3,$4,$5,$6)).status',[
        attempt,args.id??payload.id,'paid',args.amount??10000,args.currency??'EUR',JSON.stringify({...payload,...change})
      ],'service_role');
      for(const [change,args] of [[{}, {id:'tr_other'}],[{mode:'live'},{}],[{metadata:{...payload.metadata,tenant_id:randomUUID()}},{}],[{}, {amount:9999}],[{}, {currency:'USD'}]])
        await assert.rejects(settle(change,args),e=>e.code==='23514');
      await db.query('update public.payment_allocations set amount_cents=9999 where payment_attempt_id=$1',[attempt]);
      await assert.rejects(settle(),e=>e.code==='23514');
      await db.query('update public.payment_allocations set amount_cents=10000 where payment_attempt_id=$1',[attempt]);
      await db.query("update public.invoice_groups set expires_at=now()-interval '1 day' where id=$1",[group]);
      assert.equal((await settle())[0].status,'paid');
      assert.equal((await settle())[0].status,'paid');
      assert.equal((await db.query('select paid_cents from public.invoices where id=$1',[invoice])).rows[0].paid_cents,'10000');
      await denied("update public.payment_attempts set status='open' where id=$1",[attempt]);
      await assert.rejects(call('select public.apply_confirmed_provider_payment($1,$2,$3,$4,$5,$6)',[attempt,payload.id,'paid',10000,'EUR',JSON.stringify(payload)]),e=>e.code==='42501');
    });
    await t.test('manual payment remains audited and cannot occupy the provider retry namespace',async()=>{
      await denied("select public.register_manual_payment($1,now(),'FICTITIOUS payment',$2,$3)",[tenant,JSON.stringify([{invoice_id:invoice2,amount_cents:100}]),`mollie-${randomUUID()}-100`]);
      const key=`manual-${randomUUID()}`;
      const args=[tenant,JSON.stringify([{invoice_id:invoice2,amount_cents:100}]),key];
      const first=(await call("select (public.register_manual_payment($1,now(),'FICTITIOUS payment',$2,$3)).id",args))[0].id;
      assert.equal((await call("select (public.register_manual_payment($1,now(),'FICTITIOUS payment',$2,$3)).id",args))[0].id,first);
      assert.equal((await db.query('select paid_cents from public.invoices where id=$1',[invoice2])).rows[0].paid_cents,'100');
    });
    await t.test('provider preparation is atomic, repairs only unbound empty attempts and preserves terminal history on retry',async()=>{
      const retryGroup=randomUUID(),hash=randomUUID().replaceAll('-','').repeat(2);
      await call("insert into public.invoice_groups(id,tenant_id,customer_id,purpose,created_by,expires_at) values($1,$2,$3,'payment_bundle',$4,now()+interval '1 day')",[retryGroup,tenant,other,actor]);
      await call('insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id) values($1,$2,$3)',[tenant,retryGroup,invoice2]);
      await db.query("insert into public.external_action_tokens(tenant_id,purpose,subject_id,token_hash,expires_at) values($1,'payment',$2,$3,now()+interval '1 day')",[tenant,retryGroup,hash]);
      const prepare=()=>call('select (public.prepare_provider_payment($1,$2)).*',[hash,'test'],'service_role');
      await assert.rejects(call('select public.prepare_provider_payment($1,$2)',[hash,'test']),e=>e.code==='42501');
      // A real allocation-write failure must roll back the inserted attempt too.
      await db.query("create function pg_temp.fixture_reject_payment_allocation() returns trigger language plpgsql as $$begin if current_setting('fieldgrid.test.fail_allocation',true)='1' then raise exception 'FICTITIOUS allocation failure' using errcode='23514';end if;return new;end$$");
      await db.query('create trigger fixture_payment_atomicity before insert on public.payment_allocations for each row execute function pg_temp.fixture_reject_payment_allocation()');
      await db.query("select set_config('fieldgrid.test.fail_allocation','1',true)");
      await assert.rejects(prepare(),e=>e.code==='23514');
      assert.equal((await db.query('select count(*)::int n from public.payment_attempts where invoice_group_id=$1',[retryGroup])).rows[0].n,0);
      await db.query("select set_config('fieldgrid.test.fail_allocation','0',true)");
      let a=(await prepare())[0];const first=a.id;
      assert.equal((await prepare())[0].id,first);
      assert.equal((await db.query('select sum(amount_cents)::text amount from public.payment_allocations where payment_attempt_id=$1',[first])).rows[0].amount,'9900');
      const firstLease=randomUUID(),secondLease=randomUUID();
      assert.equal((await call('select public.claim_provider_payment_check($1,$2) result',[first,firstLease],'service_role'))[0].result.action,'provider');
      assert.equal((await call('select public.claim_provider_payment_check($1,$2) result',[first,secondLease],'service_role'))[0].result.action,'busy');
      await assert.rejects(call('select public.release_provider_payment_check($1,$2)',[first,firstLease]),e=>e.code==='42501');
      await call('select public.release_provider_payment_check($1,$2)',[first,firstLease],'service_role');
      await db.query("update public.payment_attempts set checkout_url='https://www.mollie.com/checkout/select-method/test',last_checked_at=now() where id=$1",[first]);
      assert.equal((await call('select public.claim_provider_payment_check($1,$2) result',[first,secondLease],'service_role'))[0].result.action,'reuse');
      await db.query('update public.payment_attempts set checkout_url=null,last_checked_at=null where id=$1',[first]);
      // Model the legacy interrupted two-request path, before provider binding.
      await db.query('delete from public.payment_allocations where payment_attempt_id=$1',[first]);
      assert.equal((await prepare())[0].id,first);
      assert.equal((await db.query('select count(*)::int n from public.payment_allocations where payment_attempt_id=$1',[first])).rows[0].n,1);
      await db.query('update public.payment_allocations set amount_cents=9899 where payment_attempt_id=$1',[first]);
      await assert.rejects(prepare(),e=>e.code==='23514');
      await db.query('update public.payment_allocations set amount_cents=9900 where payment_attempt_id=$1',[first]);
      for(const status of ['failed','expired','canceled']) {
        await db.query('update public.payment_attempts set status=$1 where id=$2',[status,a.id]);
        const next=(await prepare())[0];assert.notEqual(next.id,a.id);assert.notEqual(next.idempotency_key,a.idempotency_key);
        assert.equal((await db.query('select status from public.payment_attempts where id=$1',[a.id])).rows[0].status,status);a=next;
      }
      await db.query("update public.external_action_tokens set revoked_at=now() where token_hash=$1",[hash]);
      await assert.rejects(prepare(),e=>e.code==='42501');
    });
  } finally {await db.query('rollback');await db.end();}
});
