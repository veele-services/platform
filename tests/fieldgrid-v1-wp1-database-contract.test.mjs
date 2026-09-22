import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paymentBlockers } from '../scripts/wp1/database.mjs';
import { ALL_TABLES,assertCatalogCoverage,deletionOrder,HISTORY_DELETE_GUARDS } from '../scripts/wp1/relations.mjs';
import { fixtureId } from '../scripts/wp1/bootstrap.mjs';
import { hash,rowsDigest } from '../scripts/wp1/contract.mjs';

test('reset relation inventory is explicit and rejects drift, not default classified',()=>{
  assert.doesNotThrow(()=>assertCatalogCoverage([...ALL_TABLES].reverse()));
  assert.throws(()=>assertCatalogCoverage([...ALL_TABLES,'unreviewed_new_table']));
  assert.throws(()=>assertCatalogCoverage(ALL_TABLES.slice(1)));
  assert.equal(new Set(HISTORY_DELETE_GUARDS.map(row=>row.slice(0,2).join('.'))).size,HISTORY_DELETE_GUARDS.length);
});
test('payment preflight blocks malformed/live rows but leaves Mollie terminality to provider truth',()=>{
  const data=(payments,batches=[])=>({payments,customer_payment_batches:batches});
  assert.equal(paymentBlockers(data([])),0);
  for(const row of [{},{payment_method:'mollie'},
    {payment_method:'mollie',provider_mode:'test',mollie_payment_id:'tr_staging_demo_bad'}]) {
    assert.ok(paymentBlockers(data([row]))>0);
  }
  assert.equal(paymentBlockers(data([{payment_method:'mollie',provider_mode:'live',mollie_payment_id:'tr_Test123'}])),0);
  assert.equal(paymentBlockers(data([{payment_method:'mollie',provider_mode:null,mollie_payment_id:'tr_Test123'}])),0);
  const localDemo={id:'30000000-0000-4000-8000-000000000001',tenant_id:'10000000-0000-4000-8000-000000000001',source_id:null,payment_method:'mollie',mollie_payment_id:'tr_staging_demo_old',checkout_url:'https://www.mollie.com/checkout/staging-demo/old',paid_at:null,status:'failed'};
  assert.equal(paymentBlockers({...data([localDemo]),payment_allocations:[]}),0);
  assert.ok(paymentBlockers({...data([localDemo]),payment_allocations:[{payment_id:localDemo.id}]})>0);
  const pending={payment_method:'mollie',provider_mode:'test',mollie_payment_id:'tr_Test123',status:'pending',provider_status:'open'};
  assert.equal(paymentBlockers(data([pending])),0);
  assert.equal(paymentBlockers(data([pending],[{mollie_payment_id:'tr_Test123'}])),0);
  assert.ok(paymentBlockers(data([],[{mollie_payment_id:'tr_Test123'}]))>0);
  assert.ok(paymentBlockers(data([{payment_method:'manual_bank',status:'pending'}]))>0);
  assert.equal(paymentBlockers(data([{payment_method:'manual_bank',status:'paid'}])),0);
});
test('approved inventory binds content rather than counts and is order stable',()=>{
  assert.equal(hash({b:1,a:2}),hash({a:2,b:1}));
  assert.equal(rowsDigest([{a:1},{a:2}]),rowsDigest([{a:2},{a:1}]));
  assert.notEqual(rowsDigest([{a:1}]),rowsDigest([{a:2}]));
});
test('new fixtures use operation-specific identities rather than deleted user identities',()=>{
  const op='10000000-0000-4000-8000-000000000001';
  assert.equal(fixtureId(op,'personnel'),fixtureId(op,'personnel'));
  assert.notEqual(fixtureId(op,'personnel'),fixtureId(op,'isolation'));
});


test('delete order treats CASCADE and SET NULL as resolving edges but preserves hard-cycle failure', () => {
  const edge = (child, parent, action) => ({
    childSchema: 'public',
    child,
    parentSchema: 'public',
    parent,
    action,
  });

  const order = deletionOrder([
    edge('assignments', 'customers', 'c'),
    edge('customers', 'assignments', 'r'),
  ]);
  assert.ok(order.indexOf('customers') < order.indexOf('assignments'));

  const setNullOrder = deletionOrder([
    edge('assignments', 'customers', 'n'),
    edge('customers', 'assignments', 'r'),
  ]);
  assert.ok(setNullOrder.indexOf('customers') < setNullOrder.indexOf('assignments'));

  assert.throws(
    () => deletionOrder([
      edge('assignments', 'customers', 'r'),
      edge('customers', 'assignments', 'a'),
    ]),
    /FK_CYCLE/,
  );
});
