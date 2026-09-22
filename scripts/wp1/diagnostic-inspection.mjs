import { Collector, DiagnosticError, ReadOnlySession, check } from './diagnostic-core.mjs';

// Catalog identifiers are fixed source, not workflow input or discovered delete targets.
export const CATALOG_SQL = Object.freeze({
  tables: `SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force,c.relacl::text AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`,
  policies: `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
  triggers: `SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS enabled,t.tgtype AS type,
    p.proname AS function,pn.nspname AS "functionSchema",pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(p.oid) AS body
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  fks: `SELECT ns.nspname AS "childSchema",c.relname AS child,pns.nspname AS "parentSchema",p.relname AS parent,
    co.conname AS name,co.confdeltype AS action,pg_get_constraintdef(co.oid) AS definition,
    ARRAY(SELECT a.attname::text FROM unnest(co.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS "childColumns",
    ARRAY(SELECT a.attname::text FROM unnest(co.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=k.num ORDER BY k.ord) AS "parentColumns"
    FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_class p ON p.oid=co.confrelid JOIN pg_namespace pns ON pns.oid=p.relnamespace
    WHERE co.contype='f' AND (ns.nspname='public' OR pns.nspname='public') ORDER BY ns.nspname,c.relname,co.conname`,
});
const numbered = index => String(index + 1).padStart(4, '0');

/** An observation, NEVER a cleanup exemption. Synthetic paid rows stay visible. */
export function paymentKind(row, data) {
  const invoice = (data.invoices ?? []).find(item => item.id === row.invoice_id && item.tenant_id === row.tenant_id);
  const seed = typeof row.invoice_id === 'string' &&
    /^tr_staging_demo_[a-f0-9]{8}_(open|pending|paid|failed|canceled|expired)$/.test(row.mollie_payment_id ?? '') &&
    row.mollie_payment_id.startsWith(`tr_staging_demo_${row.invoice_id.slice(0, 8)}_`) &&
    row.checkout_url === `https://www.mollie.com/checkout/staging-demo/${row.invoice_id}` &&
    typeof invoice?.notes === 'string' && invoice.notes.includes('VEELE_STAGING_DEMO_DEN_HAAG');
  if (seed) return 'seed_signature';
  if (/^tr_[A-Za-z0-9]+$/.test(row.mollie_payment_id ?? '')) return 'provider_reference';
  if (row.payment_method === 'mollie' || row.mollie_payment_id) return 'unresolved_reference';
  return 'non_provider';
}

export async function inspectDatabase(session, collector, context) {
  const { ALL_TABLES, DELETE_TABLES, PRESERVE_TABLES, CLASSIFICATION, JOURNALS, assertCatalogCoverage, deletionOrder } = await import('./relations.mjs');
  const { identifier, rowsDigest, hash, MAX_ROWS, MAX_BYTES } = await import('./contract.mjs');
  const { verifyMigrationSource } = await import('./database.mjs');
  const data = {}, rowDigests = {}, catalogs = {}, journals = {};
  for (const [name, query] of Object.entries(CATALOG_SQL)) {
    const rows = await collector.run(`catalog.${name}`, () => session.read(async client => {
      const result = (await client.query(query)).rows;
      check(result.length <= 10000, 'CATALOG_LIMIT');
      return { value: result, counts: { entries: result.length } };
    }), ['source.snapshot'], 'CATALOG_READ_FAILED');
    if (rows) catalogs[name] = rows;
  }
  await collector.run('catalog.coverage', async () => {
    assertCatalogCoverage(catalogs.tables.map(row => row.name));
  }, ['catalog.tables'], 'CATALOG_COVERAGE');
  await collector.run('catalog.delete_order', async () => {
    const order = deletionOrder(catalogs.fks);
    return { value: order, counts: { relations: order.length } };
  }, ['catalog.fks'], 'FK_ORDER_INVALID');

  let bytes = 0, total = 0;
  for (const table of ALL_TABLES) {
    if (bytes >= MAX_BYTES || total >= MAX_ROWS) {
      collector.skip(`table.${table}`, [], 'INVENTORY_BUDGET_EXHAUSTED');
      continue;
    }
    const rows = await collector.run(`table.${table}`, () => session.read(async client => {
      const result = (await client.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t LIMIT ${MAX_ROWS + 1}`)).rows.map(item => item.row);
      total += result.length; bytes += Buffer.byteLength(JSON.stringify(result));
      check(total <= MAX_ROWS && bytes <= MAX_BYTES, 'INVENTORY_LIMIT');
      return { value: result, counts: { rows: result.length } };
    }), ['source.snapshot'], 'TABLE_READ_FAILED');
    if (rows) { data[table] = rows; rowDigests[table] = rowsDigest(rows); }
  }
  for (const [index, journal] of JOURNALS.entries()) {
    const rows = await collector.run(`journal.${index}`, () => session.read(async client => {
      const [schema, table] = journal.split('.');
      const result = (await client.query(`SELECT to_jsonb(t) AS row FROM ${identifier(schema)}.${identifier(table)} t ORDER BY to_jsonb(t)::text LIMIT 10001`)).rows.map(item => item.row);
      check(result.length <= 10000, 'JOURNAL_LIMIT');
      return { value: result, counts: { rows: result.length } };
    }), ['source.snapshot'], 'JOURNAL_READ_FAILED');
    if (rows) journals[journal] = rows;
  }
  await collector.run('journal.source_contract', () => session.read(async client => {
    await verifyMigrationSource(client);
  }), ['source.snapshot', ...JOURNALS.map((_, index) => `journal.${index}`)], 'MIGRATION_CONTRACT_MISMATCH');

  await collector.run('scope.policy', async () => ({ counts: {
    delete_relations: DELETE_TABLES.length, preserve_relations: PRESERVE_TABLES.length,
    auth_identities_retained: 1, website_outside_reset: 1,
    retained_rows: PRESERVE_TABLES.reduce((n, name) => n + (data[name]?.length ?? 0), 0),
    observed_relations: Object.keys(data).length,
  } }));
  // Report the policy per source-owned relation, including retained test content.
  for (const name of ALL_TABLES) {
    if (data[name]) collector.add(`scope.${name}`, 'PASS', CLASSIFICATION[name] === 'delete-test-data' ? 'DELETE_TEST_DATA' : 'RETAINED_BY_CURRENT_POLICY', { observed_rows: data[name].length });
    else collector.skip(`scope.${name}`, [`table.${name}`]);
  }
  await collector.run('data.legal_hold', async () => {
    const count = data.dossier_profiles.filter(row => row.legal_hold === true || row.legal_hold_active === true).length;
    check(count === 0, 'LEGAL_HOLD');
  }, ['table.dossier_profiles']);
  if (catalogs.fks) {
    for (const [index, fk] of catalogs.fks.entries()) {
      if (fk.parentSchema !== 'public' || !DELETE_TABLES.includes(fk.parent) || (fk.childSchema === 'public' && DELETE_TABLES.includes(fk.child))) continue;
      await collector.run(`reference.${numbered(index)}`, () => session.read(async client => {
        check(fk.childSchema === 'public' && ALL_TABLES.includes(fk.child), 'EXTERNAL_REFERENCE');
        check(Array.isArray(fk.childColumns) && fk.childColumns.length > 0 && fk.childColumns.length === fk.parentColumns.length, 'FK_CATALOG_INVALID');
        const join = fk.childColumns.map((column, i) => `c.${identifier(column)}=p.${identifier(fk.parentColumns[i])}`).join(' AND ');
        const rows = (await client.query(`SELECT 1 FROM public.${identifier(fk.child)} c JOIN public.${identifier(fk.parent)} p ON ${join} LIMIT 1`)).rows;
        check(rows.length === 0, 'PRESERVED_REFERENCE');
      }), ['source.snapshot'], 'REFERENCE_CHECK_FAILED');
    }
  } else collector.skip('reference.scan', ['catalog.fks']);

  const candidates = await collector.run('access.candidates', () => session.read(async client => {
    const rows = (await client.query(`SELECT DISTINCT m.user_id FROM public.tenant_users m
      JOIN auth.users a ON a.id=m.user_id
      JOIN public.tenant_user_roles g ON g.user_id=m.user_id AND g.tenant_id=m.tenant_id
      JOIN public.tenant_roles r ON r.id=g.tenant_role_id AND r.tenant_id=g.tenant_id
      JOIN public.roles t ON t.id=r.template_role_id
      WHERE m.tenant_id=$1 AND m.status='active' AND r.name='Management' AND r.is_system AND NOT r.is_custom
      AND t.name='Management' AND t.is_system ORDER BY m.user_id LIMIT 21`, [context.tenantId])).rows;
    check(rows.length <= 20, 'ADMIN_CANDIDATE_LIMIT');
    return { value: rows, counts: { candidates: rows.length } };
  }), ['source.snapshot'], 'MANAGER_LOOKUP_FAILED');
  const allowed = [];
  for (const [index, row] of (candidates ?? []).entries()) {
    const result = await collector.run(`access.candidate_${numbered(index)}`, () => session.read(async client => {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [row.user_id, JSON.stringify({ sub: row.user_id, role: 'authenticated' })]);
      const decision = (await client.query('SELECT public.is_management_for_tenant($1::uuid) AS allowed', [context.tenantId])).rows[0];
      check(decision?.allowed === true, 'NOT_CANONICAL_MANAGER');
      return { value: row.user_id };
    }), ['source.snapshot'], 'MANAGER_HELPER_FAILED');
    if (result) allowed.push(result);
  }
  await collector.run('access.manager', async () => {
    check(allowed.length === 1, allowed.length ? 'MANAGER_AMBIGUOUS' : 'MANAGER_MISSING');
    context.adminId = allowed[0];
  }, ['access.candidates']);
  return { data, rowDigests, catalogs, context, journalDigests: Object.fromEntries(Object.entries(journals).map(([name, rows]) => [name, hash(rows)])), catalogDigests: Object.fromEntries(Object.entries(catalogs).map(([name, rows]) => [name, hash(rows)])) };
}

export async function inspectPayments(collector, database, key, request = fetch, dependencies) {
  const { paymentBlockers } = dependencies ?? await import('./database.mjs');
  const { verifyTestPayments } = dependencies ?? await import('./providers.mjs');
  const data = database.data;
  if (!data.payments) { collector.skip('payments.rows', ['table.payments']); return; }
  const rows = data.payments;
  let lookups = 0;
  collector.add('payments.rows', 'PASS', null, { rows: rows.length });
  await collector.run('payments.test_key', async () => {
    check(typeof key === 'string' && /^test_[A-Za-z0-9]+$/.test(key), 'MOLLIE_TEST_KEY_REQUIRED');
  });
  for (const [index, row] of rows.entries()) {
    const id = `payment.${numbered(index)}`, kind = paymentKind(row, data);
    collector.add(`${id}.classification`, 'PASS', null, {
      [kind]: 1, has_paid_at: row.paid_at ? 1 : 0,
      allocations: (data.payment_allocations ?? []).filter(item => item.payment_id === row.id).length,
    });
    await collector.run(`${id}.local`, async () => {
      check(paymentBlockers({ ...data, payments: [row], customer_payment_batches: [] }) === 0, 'LOCAL_PAYMENT_BLOCKER');
    }, ['table.payment_allocations'], 'LOCAL_PAYMENT_CHECK_FAILED');
    if (kind === 'provider_reference') {
      if (++lookups > 100) { collector.skip(`${id}.provider`, [], 'PROVIDER_LOOKUP_BUDGET'); continue; }
      await collector.run(`${id}.provider`, async () => {
        try { await verifyTestPayments({ data: { ...data, payments: [row] } }, { [row.tenant_id]: key }, request); }
        catch (error) {
          const codes = new Set(['PAYMENT_NOT_TEST', 'MOLLIE_TEST_KEY_REQUIRED', 'PAYMENT_PROVIDER_UNAVAILABLE', 'PAYMENT_PROVIDER_MISMATCH', 'PAYMENT_PROVIDER_ACTIVE', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_PROFILE_MISMATCH', 'PAYMENT_METADATA_MISMATCH']);
          throw new DiagnosticError(codes.has(error.code) ? error.code : 'PAYMENT_LOOKUP_FAILED');
        }
      }, ['payments.test_key']);
    } else if (kind === 'seed_signature' || kind === 'non_provider') {
      collector.add(`${id}.provider`, 'NOT_APPLICABLE', 'NO_PROVIDER_LOOKUP_APPLICABLE');
    } else collector.skip(`${id}.provider`, [`${id}.classification`], 'UNVERIFIED_PROVIDER_REFERENCE');
  }
  if (!data.customer_payment_batches) { collector.skip('batches.scan', ['table.customer_payment_batches']); return; }
  for (const [index, row] of data.customer_payment_batches.entries()) {
    await collector.run(`batch.${numbered(index)}`, async () => {
      if (row.mollie_payment_id) {
        const linked = rows.filter(item => item.mollie_payment_id === row.mollie_payment_id && item.tenant_id === row.tenant_id);
        check(linked.length === 1, 'BATCH_PROVIDER_LINK');
      }
      for (const item of data.customer_payment_batch_items.filter(item => item.batch_id === row.id)) {
        check(data.invoices.some(invoice => invoice.id === item.invoice_id && invoice.tenant_id === row.tenant_id), 'BATCH_INVOICE_LINK');
      }
    }, ['table.customer_payment_batch_items', 'table.invoices'], 'BATCH_CHECK_FAILED');
  }
}
