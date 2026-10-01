import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Query-first roles: real authenticated sessions, delegation, isolation and revisions', async t => {
  if (process.env.FIELDGRID_STAGING_SMOKE) throw new Error('Incomplete authorization cutover: local tests only');
  const db = await workOrderTestDatabase();
  const tenant = randomUUID(), other = randomUUID();
  const users = Object.fromEntries(['manager', 'target', 'outsider', 'restricted'].map(k => [k, randomUUID()]));
  const sessions = Object.fromEntries(Object.keys(users).map(k => [k, randomUUID()]));
  const members = {};
  let management, custom, assigned;
  const call = async (sql, values, who = 'manager', principal = 'authenticated') => {
    await db.query('savepoint action');
    try {
      assert(['authenticated', 'anon'].includes(principal));
      await db.query(`set local role ${principal}`);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[who], role: principal, session_id: sessions[who] })]);
      const r = await db.query(sql, values);
      await db.query('reset role'); await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query('release savepoint action'); return r.rows[0]?.data;
    } catch (e) { await db.query('rollback to savepoint action'); await db.query('release savepoint action'); throw e; }
  };
  const requestRevisions = new Map();
  const command = async (operation, input, who = 'manager', target = tenant, key = randomUUID()) => {
    if (!requestRevisions.has(key)) requestRevisions.set(key, (await db.query('select revision from private.authorization_state where tenant_id=$1', [target])).rows[0]?.revision);
    return call('select public.authorization_command($1,$2,$3,$4) data', [target, operation, { expected_state_revision: requestRevisions.get(key), ...input }, key], who);
  };
  const query = (section, who = 'manager', target = tenant) => call('select public.authorization_query($1,$2) data', [target, section], who);
  const has = async (who, cap, resource = {}) => (await db.query('select private.authorization_has($1,$2,$3,$4) ok', [tenant, users[who], cap, resource])).rows[0].ok;
  const permission = (key, scope = { all: true }) => ({ key, scope });
  const denied = e => e.code === '42501';
  await db.query('begin');
  try {
    for (const id of [tenant, other]) {
      await db.query("insert into public.tenants(id,name,slug) values($1,'Fictitious role test',$2)", [id, `roles-${id}`]);
      await db.query('insert into public.tenant_settings(tenant_id) values($1)', [id]);
      await db.query('select private.authorization_seed($1)', [id]);
    }
    for (const [name, id] of Object.entries(users)) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `${id}@roles.example.test`]);
      await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())', [sessions[name], id]);
      members[name] = (await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active') returning id", [name === 'outsider' ? other : tenant, id])).rows[0].id;
    }
    management = (await db.query("select * from private.tenant_roles where tenant_id=$1 and template_code='management'", [tenant])).rows[0];
    await db.query('insert into private.role_assignments(tenant_id,role_id,membership_id) values($1,$2,$3)', [tenant, management.id, members.manager]);

    await t.test('seven stable templates; idempotent seeds preserve tenant edits', async () => {
      assert.equal((await query('roles')).data.length, 7);
      await db.query("update private.tenant_roles set name='Directie op maat' where id=$1", [management.id]);
      await db.query('select private.authorization_seed($1)', [tenant]);
      const rows = (await query('roles')).data;
      assert.equal(rows.length, 7); assert.equal(rows.find(r => r.id === management.id).name, 'Directie op maat');
      assert.equal(await has('manager', 'roles.create'), true);
      assert.equal(await has('manager', 'tickets.internal.hr'), false);
      assert.equal(await has('manager', 'platform.support.config'), false);
    });
    await t.test('a custom name collision does not prevent creation of all standard roles', async () => {
      const freshTenant = randomUUID();
      await db.query("insert into public.tenants(id,name,slug) values($1,'Fictitious seed conflict',$2)", [freshTenant, `roles-${freshTenant}`]);
      await db.query("insert into private.tenant_roles(tenant_id,name) values($1,'Management')", [freshTenant]);
      await db.query('select private.authorization_seed($1)', [freshTenant]);
      await db.query('select private.authorization_seed($1)', [freshTenant]);
      const rows = (await db.query('select name,template_code from private.tenant_roles where tenant_id=$1', [freshTenant])).rows;
      assert.equal(rows.length, 8); assert.equal(rows.filter(r => r.template_code).length, 7);
      assert.equal(rows.find(r => r.template_code === 'management').name, 'Management (standaard 1)');
    });
    await t.test('manager delegates confidential capability without receiving it', async () => {
      custom = await command('create', { name: 'HR meldingen', description: 'Fictitious delegated access', permissions: [permission('backoffice.access'), permission('tickets.internal.read'), permission('tickets.internal.hr')], delegations: [] });
      assigned = await command('assign', { role_id: custom.id, expected_revision: custom.revision, membership_id: members.target, scope: { all: true } });
      assert.equal(await has('target', 'tickets.internal.hr'), true);
      assert.equal(await has('manager', 'tickets.internal.hr'), false);
      assert.equal(await has('target', 'roles.create'), false);
    });
    await t.test('no direct table access, anonymous access or cross-tenant command', async () => {
      await assert.rejects(call('select * from private.tenant_roles', []), denied);
      await assert.rejects(call('select public.authorization_query($1,$2) data', [tenant, 'roles'], 'manager', 'anon'), denied);
      await assert.rejects(query('roles', 'outsider'), denied);
      await assert.rejects(query('roles', 'manager', other), denied);
      await assert.rejects(command('assign', { role_id: custom.id, expected_revision: custom.revision, membership_id: members.outsider, scope: { all: true } }), e => e.code === '23514');
      await assert.rejects(command('create', { name: 'Management', permissions: [], delegations: [] }, 'target'), denied);
    });
    await t.test('known role name grants nothing; platform/unknown keys and empty scopes rejected', async () => {
      const r = await command('create', { name: 'Management', permissions: [], delegations: [] });
      await command('assign', { role_id: r.id, expected_revision: r.revision, membership_id: members.restricted, scope: { all: true } });
      assert.equal(await has('restricted', 'roles.assign'), false);
      for (const key of ['platform.support.config', 'tenant.*', 'nonexistent.read']) await assert.rejects(command('create', { name: 'Forbidden key', permissions: [permission(key)], delegations: [] }), denied);
      for (const scope of [{}, { personnel_ids: [] }, { all: false }, { all: true, personnel_ids: [] }, { all: true, tenant_ids: [other] }]) {
        await assert.rejects(command('create', { name: 'Forbidden scope', permissions: [permission('notifications.send_staff', scope)], delegations: [] }), denied);
      }
    });
    await t.test('dependencies are explicit; silent read expansion is forbidden', async () => {
      await assert.rejects(command('create', { name: 'Missing dependency', permissions: [permission('tickets.internal.hr')], delegations: [] }), e => e.code === '23514');
    });
    await t.test('optimistic locking, idempotent retry and audited before/after', async () => {
      const key = randomUUID(), value = { role_id: custom.id, expected_revision: 1, name: 'HR meldingen aangepast', permissions: custom.permissions, delegations: [] };
      const changed = await command('update', value, 'manager', tenant, key);
      assert.equal(changed.revision, 2);
      assert.deepEqual(await command('update', value, 'manager', tenant, key), changed);
      await assert.rejects(command('update', { ...value, name: 'Changed retry' }, 'manager', tenant, key), e => e.code === '23514');
      await assert.rejects(command('update', value), e => e.code === '40001');
      const audit = (await query('activity')).data.find(a => a.action === 'update');
      assert.equal(audit.before_value.name, 'HR meldingen'); assert.equal(audit.after_value.name, changed.name);
      custom = changed;
    });
    await t.test('reviewed impact becomes stale when another manager changes access', async () => {
      const reviewed = (await query('roles')).revision;
      await command('create', { name: 'Nieuwe rol na beoordeling', permissions: [], delegations: [] });
      await assert.rejects(command('update', { role_id: custom.id, expected_revision: custom.revision, expected_state_revision: reviewed, name: custom.name, permissions: custom.permissions, delegations: [] }), e => e.code === '40001');
    });
    await t.test('role scopes do not bleed across capabilities, forged IDs are rejected', async () => {
      const people = [randomUUID(), randomUUID()];
      for (const id of people) await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Fictitious scope person')", [id, tenant]);
      const limited = await command('create', { name: 'Geselecteerd personeel', permissions: [permission('notifications.send_staff', { personnel_ids: [people[0]] })], delegations: [] });
      const broad = await command('create', { name: 'Algemene verzendhistorie', permissions: [permission('notifications.sent.read')], delegations: [] });
      for (const r of [limited, broad]) await command('assign', { role_id: r.id, expected_revision: 1, membership_id: members.target, scope: { all: true } });
      assert.equal(await has('target', 'notifications.send_staff', { personnel_id: people[0] }), true);
      assert.equal(await has('target', 'notifications.send_staff', { personnel_id: people[1] }), false);
      assert.equal(await has('target', 'notifications.sent.read', { personnel_id: people[1] }), true);
      assert.equal(await has('target', 'notifications.send_staff'), false);
      const foreignPerson = randomUUID();
      await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Fictitious other tenant')", [foreignPerson, other]);
      assert.equal(await has('target', 'notifications.sent.read', { personnel_id: foreignPerson }), false);
      assert.equal(await has('target', 'notifications.sent.read', { personnel_id: randomUUID() }), false);
      await assert.rejects(command('create', { name: 'Forged selection', permissions: [permission('notifications.send_staff', { personnel_ids: [randomUUID()] })], delegations: [] }), denied);
    });
    await t.test('revocation takes effect for an already existing session; archive preserves history', async () => {
      await command('unassign', { assignment_id: assigned.id, expected_revision: assigned.revision });
      assert.equal(await has('target', 'tickets.internal.hr'), false);
      const archived = await command('archive', { role_id: custom.id, expected_revision: custom.revision });
      assert(archived.archived_at);
      await assert.rejects(command('assign', { role_id: custom.id, expected_revision: archived.revision, membership_id: members.target, scope: { all: true } }), e => e.code === '23514');
      assert((await query('activity')).data.some(a => a.action === 'unassign'));
    });
    await t.test('last manager cannot remove their management path; stale authentication is refused', async () => {
      const id = (await db.query('select id from private.role_assignments where membership_id=$1 and role_id=$2 and revoked_at is null', [members.manager, management.id])).rows[0].id;
      await assert.rejects(command('unassign', { assignment_id: id, expected_revision: 1 }), e => e.code === '23514');
      assert.equal(await has('manager', 'roles.assign'), true);
      await db.query("update auth.sessions set created_at=now()-interval '10 minutes' where id=$1", [sessions.manager]);
      await assert.rejects(command('create', { name: 'Stale authentication', permissions: [], delegations: [] }), denied);
      await db.query('update auth.sessions set created_at=now() where id=$1', [sessions.manager]);
    });
    await t.test('new registry keys are not silently usable or delegable', async () => {
      await db.query("insert into public.permission_catalog(key,domain,name,description,module,action,scopes) values('test.future.read','tenant','Fictitious future right','Test only','test','read',array['tenant'])");
      await db.query('select private.authorization_seed($1)', [tenant]);
      assert.equal(await has('manager', 'test.future.read'), false);
      await assert.rejects(command('create', { name: 'Silent new capability', permissions: [permission('test.future.read')], delegations: [] }), denied);
    });
    await t.test('restricted delegation cannot grant a stronger existing role or broader scope', async () => {
      const person = randomUUID();
      await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Fictitious limited delegation')", [person, tenant]);
      const limited = await command('create', { name: 'Beperkt rollenbeheer', permissions: ['backoffice.access', 'roles.create', 'roles.assign', 'roles.permissions.delegate'].map(k => permission(k)), delegations: [permission('notifications.send_staff', { personnel_ids: [person] })] });
      await command('assign', { role_id: limited.id, expected_revision: 1, membership_id: members.restricted, scope: { all: true } });
      await assert.rejects(command('create', { name: 'Too broad', permissions: [permission('notifications.send_staff')], delegations: [] }, 'restricted'), denied);
      const narrow = await command('create', { name: 'Correct beperkte rol', permissions: [permission('notifications.send_staff', { personnel_ids: [person] })], delegations: [] }, 'restricted');
      assert(narrow.id);
      await assert.rejects(command('assign', { role_id: management.id, expected_revision: 1, membership_id: members.target, scope: { all: true } }, 'restricted'), denied);
      await assert.rejects(command('create', { name: 'Delegation escalation', permissions: [], delegations: [permission('roles.assign')] }, 'restricted'), denied);
    });
    await t.test('active role cannot be archived, duplicate is independent and restoration is versioned', async () => {
      await assert.rejects(command('archive', { role_id: management.id, expected_revision: 1 }), e => e.code === '23514');
      const duplicate = await command('duplicate', { role_id: management.id, expected_revision: 1, name: 'Eigen directierol' });
      assert.equal(duplicate.template_code, null);
      await command('update', { role_id: duplicate.id, expected_revision: 1, name: 'Zelfstandige lege rol', permissions: [], delegations: [] });
      assert.equal(await has('manager', 'roles.create'), true);
      const restored = await command('restore', { role_id: management.id, expected_revision: 1 });
      assert.equal(restored.revision, 2); assert.equal(restored.name, 'Directie op maat');
      management = restored;
    });
    await t.test('deactivation cannot bypass the last-manager guard after cutover', async () => {
      await db.query('update private.authorization_state set enforced=true where tenant_id=$1', [tenant]);
      await db.query('savepoint suspend');
      try {
        await assert.rejects(db.query("update public.tenant_memberships set status='suspended' where id=$1", [members.manager]), e => e.code === '23514');
      } finally { await db.query('rollback to savepoint suspend'); await db.query('release savepoint suspend'); }
      assert.equal(await has('manager', 'roles.assign'), true);
      await db.query('savepoint ban');
      try {
        await assert.rejects(db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [users.manager]), e => e.code === '23514');
      } finally { await db.query('rollback to savepoint ban'); await db.query('release savepoint ban'); }
      await db.query('update private.authorization_state set enforced=false where tenant_id=$1', [tenant]);
    });
    await t.test('a temporary replacement is not a permanent last management path', async () => {
      await command('assign', { role_id: management.id, expected_revision: management.revision, membership_id: members.target, scope: { all: true }, expires_at: new Date(Date.now() + 3600000).toISOString() });
      const id = (await db.query('select id from private.role_assignments where membership_id=$1 and role_id=$2 and revoked_at is null', [members.manager, management.id])).rows[0].id;
      await assert.rejects(command('unassign', { assignment_id: id, expected_revision: 1 }), e => e.code === '23514');
    });
    await t.test('cutover uses role grants through existing capability helper without legacy fallback', async () => {
      await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,'tickets.internal.hr','{\"all\":true}') on conflict do nothing", [tenant, users.restricted, members.restricted]);
      const cap = async who => (await db.query("select private.ticket_has_cap($1,$2,'tickets.internal.hr') ok", [tenant, users[who]])).rows[0].ok;
      assert.equal(await cap('restricted'), true);
      await db.query('update private.authorization_state set enforced=true where tenant_id=$1', [tenant]);
      assert.equal(await cap('restricted'), false);
      const fresh = await command('create', { name: 'Herbruikte autorisatie', permissions: [permission('tickets.internal.read'), permission('tickets.internal.hr')], delegations: [] });
      const grant = await command('assign', { role_id: fresh.id, expected_revision: 1, membership_id: members.restricted, scope: { all: true } });
      assert.equal(await cap('restricted'), true);
      await command('unassign', { assignment_id: grant.id, expected_revision: 1 });
      assert.equal(await cap('restricted'), false);
      await db.query('update private.authorization_state set enforced=false where tenant_id=$1', [tenant]);
    });
    await t.test('revoked Auth session cannot use its otherwise valid management grants', async () => {
      await db.query('delete from auth.sessions where id=$1', [sessions.manager]);
      await assert.rejects(query('roles'), denied);
    });
  } finally { await db.query('rollback'); await db.end(); }
});
