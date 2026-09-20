import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/fieldgrid-production-deploy.yml', root), 'utf8');
const productionHosts = /^      PLATFORM_HOSTS: (.+)$/mu.exec(workflow)?.[1];
assert.equal(productionHosts, 'admin.fieldgrid.nl,platform.fieldgrid.nl,app.fieldgrid.nl,fieldgrid.nl');

function load(path, dependencies, env) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, process: { env },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency in ${path}: ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}

function fixture(surface, host, { environment = 'production', hosts = productionHosts, rows = [] } = {}) {
  const env = { APP_ENV: environment, PLATFORM_HOSTS: hosts };
  const activeStatuses = ['trial', 'active'];
  const context = load('lib/db/src/tenant-context.ts', {
    './schema/tenants': { TENANT_RUNTIME_ACTIVE_STATUSES: activeStatuses },
  }, env);
  const ownership = load('lib/db/src/tenant-environment.ts', { './tenant-context': context }, env);
  const columns = names => Object.fromEntries(names.map(name => [name, name]));
  const queries = [];
  const database = { select(selection) {
    const query = { selection, clauses: null };
    queries.push(query);
    const chain = {
      from() { return chain; }, innerJoin() { return chain; },
      where(clauses) { query.clauses = clauses; return chain; },
      async limit(count) {
        return rows.filter(row => query.clauses(row)).slice(0, count).map(row =>
          Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column]])));
      },
    };
    return chain;
  } };
  const helpers = { ...context, ...ownership, db: database, TENANT_RUNTIME_ACTIVE_STATUSES: activeStatuses,
    tenantsTable: columns(['id', 'isActive', 'status']),
    tenantDomainsTable: columns(['tenantId', 'domain', 'type', 'verificationStatus', 'tlsStatus']),
  };
  const portal = load(`artifacts/${surface}/src/lib/auth/tenant.ts`, {
    '@workspace/db': helpers,
    'next/headers': { headers: async () => new Map([['host', host]]) },
    '@/lib/supabase/server': { createClient: () => { throw new Error('Host classification must not authenticate'); } },
    'drizzle-orm': {
      eq: (column, value) => row => row[column] === value,
      ne: (column, value) => row => row[column] !== value,
      inArray: (column, values) => row => values.includes(row[column]),
      and: (...clauses) => row => clauses.every(clause => clause(row)),
    },
  }, env);
  return { resolve: portal.resolvePortalTenantFromHost, currentTenantId: portal.getCurrentPortalTenantId, queries };
}

for (const surface of ['personeel-pwa', 'klant-pwa']) {
  test(`${surface}: all configured production entrypoints resolve as platform without a tenant lookup`, async () => {
    for (const host of [...productionHosts.split(','), 'APP.FIELDGRID.NL:443']) {
      const f = fixture(surface, host);
      const result = await f.resolve();
      assert.equal(result.kind, 'platform');
      assert.deepEqual(Object.keys(result), ['kind']);
      assert.equal(f.queries.length, 0);
      if (surface === 'klant-pwa') {
        assert.equal(await f.currentTenantId(), null, 'A generic platform host cannot supply a customer tenant');
        assert.equal(f.queries.length, 0);
      }
    }
  });

  test(`${surface}: staging and unregistered production subdomains remain blocked`, async () => {
    for (const host of ['staging.fieldgrid.nl', 'platform-staging.fieldgrid.nl', 'tenant.staging.fieldgrid.nl']) {
      const f = fixture(surface, host);
      assert.equal((await f.resolve()).kind, 'blocked');
      assert.equal(f.queries.length, 0);
    }
    const unknown = fixture(surface, 'unregistered.fieldgrid.nl');
    assert.equal((await unknown.resolve()).kind, 'blocked');
    assert.equal(unknown.queries.length, 1);
    for (const host of productionHosts.split(',')) {
      const staging = fixture(surface, host, { environment: 'staging' });
      assert.equal((await staging.resolve()).kind, 'blocked');
      assert.equal(staging.queries.length, 0);
    }
    const unchangedStaging = fixture(surface, 'staging.fieldgrid.nl', { environment: 'staging', hosts: '' });
    assert.equal((await unchangedStaging.resolve()).kind, 'platform');
    assert.equal(unchangedStaging.queries.length, 0);
  });

  test(`${surface}: only the matching verified active tenant retains its tenant binding`, async () => {
    const tenant = { id: 'tenant-a', tenantId: 'tenant-a', domain: 'tenant-a.fieldgrid.nl',
      isActive: true, status: 'active', type: 'subdomain', verificationStatus: 'verified', tlsStatus: 'active' };
    const valid = fixture(surface, tenant.domain, { rows: [tenant] });
    const resolved = await valid.resolve();
    assert.equal(resolved.kind, 'tenant');
    assert.equal(resolved.tenantId, 'tenant-a');
    for (const override of [{ domain: 'tenant-b.fieldgrid.nl' }, { isActive: false },
      { status: 'suspended' }, { verificationStatus: 'pending' }, { type: 'platform_reserved' }]) {
      const invalid = fixture(surface, tenant.domain, { rows: [{ ...tenant, ...override }] });
      assert.equal((await invalid.resolve()).kind, 'blocked');
    }
  });
}
