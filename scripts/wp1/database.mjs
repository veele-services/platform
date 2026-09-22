import { readFile } from 'node:fs/promises';
import { ALL_TABLES, DELETE_TABLES, PRESERVE_TABLES, JOURNALS, HISTORY_DELETE_GUARDS, assertCatalogCoverage, deletionOrder } from './relations.mjs';
import { hash, textHash, rowsDigest, identifier, relation, requireThat, fail, MAX_ROWS, MAX_BYTES } from './contract.mjs';
import { assertBootstrapContext, bootstrapCanonical, verifyCanonical } from './bootstrap.mjs';
import { assertMatchingMigrationHistory, committedMigrationManifest, assertRecordedHistoricalMigrationHashes } from '../fieldgrid-phase2e-staging-preflight.mjs';

const DELETE_SET = new Set(DELETE_TABLES);
const QUEUES = new Set(['notification_delivery_attempts','notification_delivery_queue','notification_dispatches','domain_events','portal_realtime_events','personnel_notifications','customer_notifications']);
export async function journalSnapshot(client) {
  const values = {};
  for (const table of JOURNALS) values[table] = (await client.query(`SELECT to_jsonb(t) AS row FROM ${relation(table)} t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row);
  return values;
}
export async function verifyMigrationSource(client) {
  const records = (await client.query(`SELECT name,hash,baselined,applied_at AS "appliedAt" FROM drizzle.veele_sql_migrations ORDER BY applied_at,name`)).rows;
  const rows = records.map(row => ({ ...row, appliedAt: row.appliedAt instanceof Date ? row.appliedAt.toISOString() : row.appliedAt }));
  const committed = await committedMigrationManifest();
  assertMatchingMigrationHistory(rows,committed);
  const active = new Set(committed);
  const historical = rows.filter(row => !active.has(row.name));
  if (historical.length) assertRecordedHistoricalMigrationHashes(historical);
  for (const row of rows.filter(row => active.has(row.name))) {
    requireThat(/^[A-Za-z0-9_-]+\.sql$/.test(row.name), 'JOURNAL_NAME');
    const sql = await readFile(new URL(`../../lib/db/migrations/${row.name}`,import.meta.url),'utf8');
    requireThat(textHash(sql.replaceAll('\r\n','\n')) === row.hash, 'MIGRATION_HASH');
  }
  const generatedRoot = new URL('../../lib/db/migrations/generated/',import.meta.url);
  const generated = JSON.parse(await readFile(new URL('meta/_journal.json',generatedRoot),'utf8'));
  const generatedRecords = (await client.query('SELECT hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
  requireThat(generatedRecords.length === generated.entries.length, 'GENERATED_HISTORY');
  for (let i=0;i<generatedRecords.length;i++) {
    const entry = generated.entries[i];
    requireThat(/^[A-Za-z0-9_-]+$/.test(entry.tag), 'GENERATED_NAME');
    const sql = await readFile(new URL(`${entry.tag}.sql`,generatedRoot));
    requireThat(generatedRecords[i].hash === textHash(sql) && generatedRecords[i].created_at === String(entry.when), 'GENERATED_HASH');
  }
}
export async function catalogSnapshot(client) {
  const tables = (await client.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force,c.relacl::text AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  assertCatalogCoverage(tables.map(row=>row.name));
  const triggers = (await client.query(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS enabled,t.tgtype AS type,
    p.proname AS function,pn.nspname AS "functionSchema",pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(p.oid) AS body
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  const policies = (await client.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' ORDER BY tablename,policyname`)).rows;
  const fks = (await client.query(`SELECT ns.nspname AS "childSchema",c.relname AS child,pns.nspname AS "parentSchema",p.relname AS parent,
    co.conname AS name,co.confdeltype AS action,pg_get_constraintdef(co.oid) AS definition,
    ARRAY(SELECT a.attname::text FROM unnest(co.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS "childColumns",
    ARRAY(SELECT a.attname::text FROM unnest(co.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=k.num ORDER BY k.ord) AS "parentColumns"
    FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_class p ON p.oid=co.confrelid JOIN pg_namespace pns ON pns.oid=p.relnamespace
    WHERE co.contype='f' AND (ns.nspname='public' OR pns.nspname='public') ORDER BY ns.nspname,c.relname,co.conname`)).rows;
  for(const fk of fks) requireThat(Array.isArray(fk.childColumns)&&Array.isArray(fk.parentColumns)&&fk.childColumns.length===fk.parentColumns.length&&fk.childColumns.length>0,'FK_CATALOG_INVALID');
  return {tables,triggers,policies,fks};
}
export function isLocalStagingDemoPayment(data,payment) {
  const allocations=Array.isArray(data?.payment_allocations)?data.payment_allocations:[];
  return payment?.payment_method==='mollie'
    && typeof payment.id==='string'
    && typeof payment.tenant_id==='string'
    && typeof payment.mollie_payment_id==='string'
    && payment.mollie_payment_id.startsWith('tr_staging_demo_')
    && typeof payment.checkout_url==='string'
    && payment.checkout_url.startsWith('https://www.mollie.com/checkout/staging-demo/')
    && !payment.paid_at
    && !allocations.some(allocation=>allocation.payment_id===payment.id);
}
export function paymentBlockers(data) {
  let total=0;
  const terminal = new Set(['paid','failed','canceled','cancelled','expired']);
  const mollieId = value => typeof value==='string' && /^tr_[A-Za-z0-9]+$/.test(value);
  for (const payment of data.payments) {
    if (payment.payment_method === 'mollie' || payment.mollie_payment_id) {
      if (isLocalStagingDemoPayment(data,payment)) continue;
      // Local Mollie status can lag behind webhook/provider truth. Diagnose/apply
      // separately query Mollie and require test mode + terminal provider state
      // before any reset can proceed.
      if (!mollieId(payment.mollie_payment_id)) total++;
    } else if (!['manual_bank','cash','correction','settlement','other'].includes(payment.payment_method) || !terminal.has(payment.status)) total++;
  }
  for (const batch of data.customer_payment_batches) {
    if (batch.mollie_payment_id && !data.payments.some(row => row.mollie_payment_id===batch.mollie_payment_id && (isLocalStagingDemoPayment(data,row) || mollieId(row.mollie_payment_id)))) total++;
  }
  return total;
}
export async function inventoryDatabase(client, context) {
  await verifyMigrationSource(client);
  const catalog = await catalogSnapshot(client);
  await assertBootstrapContext(client,context);
  const data={},counts={}; let bytes=0, total=0;
  for (const table of ALL_TABLES) {
    const rows = (await client.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t LIMIT ${MAX_ROWS+1}`)).rows.map(row=>row.row);
    total+=rows.length; bytes+=Buffer.byteLength(JSON.stringify(rows));
    requireThat(total<=MAX_ROWS && bytes<=MAX_BYTES,'INVENTORY_LIMIT');
    data[table]=rows; counts[table]=rows.length;
  }
  const journals=await journalSnapshot(client);
  const blockers=[];
  if (paymentBlockers(data)>0) blockers.push('PAYMENTS_NOT_SETTLED_TEST');
  if (data.dossier_profiles.some(row=>row.legal_hold===true || row.legal_hold_active===true)) blockers.push('LEGAL_HOLD');
  for (const fk of catalog.fks) {
    if (fk.parentSchema!=='public' || !DELETE_SET.has(fk.parent) || (fk.childSchema==='public' && DELETE_SET.has(fk.child))) continue;
    requireThat(fk.childSchema==='public' && ALL_TABLES.includes(fk.child),'EXTERNAL_REFERENCE');
    const join=fk.childColumns.map((column,i)=>`c.${identifier(column)}=p.${identifier(fk.parentColumns[i])}`).join(' AND ');
    if ((await client.query(`SELECT 1 FROM public.${identifier(fk.child)} c JOIN public.${identifier(fk.parent)} p ON ${join} LIMIT 1`)).rows.length) blockers.push('PRESERVED_REFERENCE');
  }
  const order=deletionOrder(catalog.fks);
  const rowDigests=Object.fromEntries(ALL_TABLES.map(table=>[table,rowsDigest(data[table])]));
  // Provider accounts/memberships are retained, not recreated or reassigned.
  // Their operational personnel/customer rows can be removed independently.
  return { context, counts, data, catalog, order, journals, authCandidates:[], blockers,
    rowDigests, catalogDigest:hash(catalog), journalDigest:hash(journals), fingerprint:hash({rowDigests,catalog:hash(catalog),journals:hash(journals),context}) };
}
function unchangedExisting(before,after,table) {
  const seen = new Set(after[table].map(row=>JSON.stringify(row)));
  return before[table].every(row=>seen.has(JSON.stringify(row)));
}
export async function resetDatabase(client, expected, { rehearsal=false, inject=async()=>{}, beforeCommit=async()=>{} }={}) {
  requireThat(expected.blockers.length===0,'RESET_BLOCKED');
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  let commitStarted=false;
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const lock=(await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('fieldgrid:database-migrations:v1',0)) AS acquired")).rows[0];
    requireThat(lock?.acquired===true,'MIGRATION_LOCK');
    await client.query(`LOCK TABLE ${ALL_TABLES.map(table=>`public.${identifier(table)}`).join(',')} IN ACCESS EXCLUSIVE MODE`);
    await client.query('LOCK TABLE drizzle.veele_sql_migrations,drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE');
    const current=await inventoryDatabase(client,expected.context);
    requireThat(current.fingerprint===expected.fingerprint,'INVENTORY_DRIFT');
    requireThat(current.blockers.length===0,'RESET_BLOCKED');
    await inject('before-delete');
    const changedGuards=[];
    for (const [table,name,fn] of HISTORY_DELETE_GUARDS) {
      const trigger=current.catalog.triggers.find(row=>row.table===table&&row.name===name);
      requireThat(Boolean(trigger) && trigger.function===fn && trigger.functionSchema==='public' && ['O','A','R'].includes(trigger.enabled) && (trigger.type&8)===8,'HISTORY_GUARD_DRIFT');
      await client.query(`ALTER TABLE public.${identifier(table)} DISABLE TRIGGER ${identifier(name)}`);
      changedGuards.push(trigger);
    }
    for (const table of current.order) await client.query(`DELETE FROM public.${identifier(table)}`);
    // Retained triggers may enqueue deletion notifications. Remove these old
    // test deliveries as well before seeding; never dispatch them after resume.
    for(const table of current.order.filter(name=>QUEUES.has(name))) await client.query(`DELETE FROM public.${identifier(table)}`);
    for(const table of DELETE_TABLES) requireThat((await client.query(`SELECT 1 FROM public.${identifier(table)} LIMIT 1`)).rows.length===0,'TEST_ROWS_REMAIN');
    for (const trigger of changedGuards) {
      const mode=trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='R'?'ENABLE REPLICA':'ENABLE';
      await client.query(`ALTER TABLE public.${identifier(trigger.table)} ${mode} TRIGGER ${identifier(trigger.name)}`);
    }
    await inject('after-delete');
    const fixture=await bootstrapCanonical(client,expected.context);
    await inject('after-bootstrap');
    const proof=await verifyCanonical(client,expected.context);
    requireThat(hash(await journalSnapshot(client))===expected.journalDigest,'JOURNAL_CHANGED');
    requireThat(hash(await catalogSnapshot(client))===expected.catalogDigest,'CATALOG_CHANGED');
    for (const table of PRESERVE_TABLES) {
      const rows=(await client.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t LIMIT ${MAX_ROWS+1}`)).rows.map(row=>row.row);
      requireThat(unchangedExisting(current.data,{[table]:rows},table),'PRESERVED_DATA_CHANGED');
    }
    await inject('before-commit');
    // The real runner stages recoverable Storage changes only AFTER database
    // cleanup, canonical seeding, RLS and preservation checks have succeeded.
    // A provider error still rolls this entire DB transaction back.
    if(!rehearsal) await beforeCommit(await inventoryDatabase(client,expected.context));
    if (rehearsal) await client.query('ROLLBACK');
    else { commitStarted=true; await client.query('COMMIT'); }
    return { committed:!rehearsal, proof, fixture };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { fail('RECOVERY_REQUIRED','database'); }
    if (commitStarted) fail('COMMIT_OUTCOME_UNKNOWN','database');
    throw error;
  }
}
