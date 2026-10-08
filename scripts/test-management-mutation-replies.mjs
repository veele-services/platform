import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Management mutations preserve operational access without financial replies or membership escalation', async t => {
  const db = await workOrderTestDatabase();
  const tenant = randomUUID(), foreign = randomUUID();
  const actors = Object.fromEntries(['owner', 'planning', 'reviewer', 'target', 'staff', 'newStaff'].map(name => [name, { user: randomUUID(), session: randomUUID(), email: `${name}-${randomUUID()}@mutation.example.test` }]));
  const customer = randomUUID(), object = randomUUID(), person = randomUUID();
  const order = randomUUID(), assignment = randomUUID(), extraTask = randomUUID();
  const reviewOrders = [randomUUID(), randomUUID()], reports = [randomUUID(), randomUUID()];
  const marker = 'PRIVATE-COMMERCIAL-MUTATION-CANARY';
  const amountCanary = 9876543;
  const memberships = {}, roles = {};
  const denied = error => error.code === '42501';

  const call = async (actor, sql, params = []) => {
    await db.query('savepoint mutation_actor');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actors[actor].user, session_id: actors[actor].session, role: 'authenticated' })]);
      const rows = (await db.query(sql, params)).rows;
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query('release savepoint mutation_actor');
      return rows;
    } catch (error) {
      await db.query('rollback to savepoint mutation_actor');
      await db.query('release savepoint mutation_actor');
      throw error;
    }
  };
  const isolated = async run => {
    await db.query('savepoint mutation_case');
    try { await run(); }
    finally { await db.query('rollback to savepoint mutation_case'); await db.query('release savepoint mutation_case'); }
  };
  const version = async id => Number((await db.query('select version from public.work_orders where id=$1', [id])).rows[0].version);
  const masked = (reply, id) => {
    assert.equal(reply.id, id);
    assert.equal(reply.tenant_id, tenant);
    for (const key of ['commercial_terms', 'template_snapshot', 'details', 'planner_user_id', 'created_by']) assert.equal(reply[key], null, `Operational mutation reply must not disclose ${key}`);
    assert.equal(JSON.stringify(reply).includes(marker), false);
  };
  const bind = (actor, target = 'target', scope = tenant, email = actors[target].email) => call(actor, 'select public.bind_personnel_account($1,$2,$3)', [scope, actors[target].user, email]);
  const member = async name => (await db.query('select id,roles::text[] roles,status from public.tenant_memberships where tenant_id=$1 and user_id=$2', [tenant, actors[name].user])).rows[0];

  await db.query('begin');
  try {
    for (const scope of [tenant, foreign]) {
      await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictieve mutatietest')", [scope, `mutation-${scope}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])", [scope]);
      await db.query('select private.management_seed($1)', [scope]);
    }
    for (const [name, actor] of Object.entries(actors)) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [actor.user, actor.email]);
      await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())', [actor.session, actor.user]);
      if (name === 'newStaff') continue;
      const legacyRoles = name === 'owner' ? ['tenant_admin'] : name === 'staff' ? ['staff'] : ['management', 'planner', 'finance', 'hr'];
      memberships[name] = (await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active') returning id", [tenant, actor.user, legacyRoles])).rows[0].id;
    }
    for (const role of (await db.query('select id,code from private.management_roles where tenant_id=$1', [tenant])).rows) roles[role.code] = role.id;
    for (const [name, role] of [['planning', 'planning'], ['reviewer', 'management'], ['target', 'administration']]) await db.query('insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at) values($1,$2,$3,$4,now())', [tenant, memberships[name], roles[role], `Fictieve ${name}`]);
    // A report reviewer deliberately has no commercial or financial permissions.
    await db.query('delete from private.management_role_permissions where role_id=$1', [roles.management]);
    for (const capability of ['backoffice.access', 'backoffice.reports.read', 'backoffice.reports.write', 'backoffice.functions.review_work_order', 'backoffice.functions.review_work_order_report']) await db.query('insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,$3)', [tenant, roles.management, capability]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'MUT-C','Fictieve klant')", [customer, tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'MUT-O','Fictieve locatie','{}')", [object, tenant, customer]);
    await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status) values($1,$2,$3,'MUT-P','Fictieve medewerker','active')", [person, tenant, actors.staff.user]);
    await db.query("insert into public.availability(tenant_id,personnel_id,starts_at,ends_at,kind) values($1,$2,'2031-01-01T00:00Z','2031-01-05T00:00Z','available')", [tenant, person]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,planning_state,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by,commercial_terms,template_snapshot,details) values($1,$2,$3,$4,'MUT-W','Fictieve geplande bon','Onderhoud','planned','tentative','2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z',$5,$6,$6,$6)", [order, tenant, customer, object, actors.owner.user, { privatePrice: marker }]);
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'planned','2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z')", [assignment, tenant, order, person]);
    await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,staff_requested_amount_cents,added_by) values($1,$2,$3,'MUT-T','Fictief meerwerk',60,'task',987654,2100,true,'approved',$4,$5)", [extraTask, tenant, order, amountCanary, actors.staff.user]);
    for (let index = 0; index < reviewOrders.length; index++) {
      await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,report_state,report_version,signature_mode,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by,commercial_terms,template_snapshot,details) values($1,$2,$3,$4,$5,'Fictieve te controleren bon','Onderhoud','completed','review',1,'none','2031-01-03T09:00Z','2031-01-03T10:00Z','2031-01-03T09:00Z','2031-01-03T10:00Z',$6,$7,$7,$7)", [reviewOrders[index], tenant, customer, object, `MUT-R-${index}`, actors.owner.user, { privatePrice: marker }]);
      await db.query("insert into public.work_order_report_versions(id,tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key) values($1,$2,$3,1,$4,$5,$6,'review',$7,$8)", [reports[index], tenant, reviewOrders[index], { schema: 1, summary: 'Fictieve controleversie' }, 'a'.repeat(64), { mode: 'none', employeeRequired: false }, actors.staff.user, randomUUID()]);
      await db.query("update public.work_orders set status='completed' where id=$1", [reviewOrders[index]]);
    }

    await t.test('Planning dispatch and reschedule return masked replies while actual work changes', async () => {
      const key = randomUUID();
      const dispatched = (await call('planning', 'select to_jsonb(public.dispatch_work_order($1,$2,$3,$4)) data', [order, person, await version(order), key]))[0].data;
      masked(dispatched, order); assert.equal(dispatched.status, 'released');
      assert.equal((await db.query('select count(*) from public.dispatches where assignment_id=$1 and revoked_at is null', [assignment])).rows[0].count, '1');
      const moved = (await call('planning', "select to_jsonb(public.reschedule_work_order($1,$2,'2031-01-02T09:00Z',$3)) data", [order, person, await version(order)]))[0].data;
      masked(moved, order);
      assert.equal(new Date(moved.projected_start_at).toISOString(), '2031-01-02T09:00:00.000Z');
      assert.equal(new Date((await db.query('select projected_start_at from public.work_order_assignments where id=$1', [assignment])).rows[0].projected_start_at).toISOString(), '2031-01-02T09:00:00.000Z');
      await isolated(async () => {
        await db.query('insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,$3)', [tenant, roles.planning, 'backoffice.finance.read']);
        const full = (await call('planning', 'select to_jsonb(public.dispatch_work_order($1,$2,$3,$4)) data', [order, person, 1, key]))[0].data;
        assert.equal(full.commercial_terms.privatePrice, marker);
        await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.finance.read'", [roles.planning]);
        masked((await call('planning', 'select to_jsonb(public.dispatch_work_order($1,$2,$3,$4)) data', [order, person, 1, key]))[0].data, order);
      });
    });
    await t.test('operational dossier excludes another employee extra-work amount', async () => {
      const dossier = (await call('planning', 'select public.work_order_dossier($1,$2) data', [tenant, order]))[0].data;
      assert.equal(dossier.finance, false);
      assert.equal(dossier.tasks.find(row => row.id === extraTask).staff_requested_amount_cents, undefined);
      assert.equal(JSON.stringify(dossier).includes(String(amountCanary)), false);
    });
    await t.test('report-only reviewer can return a report without receiving financial columns', async () => {
      for (let index = 0; index < reviewOrders.length; index++) {
        const sql = index === 0 ? "select to_jsonb(public.review_work_order_report($1,$2,'returned','Fictieve aanvullende controle')) data" : "select to_jsonb(public.review_work_order($1,'returned','Fictieve aanvullende controle')) data";
        const reply = (await call('reviewer', sql, index === 0 ? [reviewOrders[index], reports[index]] : [reviewOrders[index]]))[0].data;
        masked(reply, reviewOrders[index]); assert.equal(reply.status, 'correction_required'); assert.equal(reply.report_state, 'correction');
        assert.equal((await db.query('select state from public.work_order_report_versions where id=$1', [reports[index]])).rows[0].state, 'correction');
      }
    });
    await t.test('binding staff to an active management account retains its complete profile and is idempotent', async () => {
      for (const target of ['target', 'owner']) {
        const before = (await db.query('select to_jsonb(mm) data from private.management_members mm where membership_id=$1', [memberships[target]])).rows[0].data;
        const oldRoles = (await member(target)).roles;
        await bind('owner', target); await bind('owner', target);
        const after = await member(target);
        assert.deepEqual(after.roles, [...oldRoles, 'staff']); assert.equal(after.status, 'active');
        assert.deepEqual((await db.query('select to_jsonb(mm) data from private.management_members mm where membership_id=$1', [memberships[target]])).rows[0].data, before);
      }
    });
    await t.test('binder rejects mismatched identity, inactive account or tenant, foreign tenant and live permission loss', async () => {
      await assert.rejects(bind('owner', 'target', tenant, 'wrong@example.test'), denied);
      await assert.rejects(bind('owner', 'target', foreign), denied);
      await isolated(async () => {
        await db.query("update public.tenant_memberships set status='suspended' where id=$1", [memberships.target]);
        await assert.rejects(bind('owner'), denied);
      });
      await isolated(async () => {
        await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [actors.target.user]);
        await assert.rejects(bind('owner'), denied);
      });
      await isolated(async () => {
        await db.query("update public.tenants set status='suspended' where id=$1", [tenant]);
        await assert.rejects(bind('owner'), denied);
      });
      await isolated(async () => {
        for (const capability of ['backoffice.personnel.write', 'backoffice.functions.invite_personnel']) await db.query('insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,$3)', [tenant, roles.planning, capability]);
        await bind('planning', 'newStaff');
        assert.deepEqual((await member('newStaff')).roles, ['staff']);
        assert.equal((await db.query('select count(*) from private.management_members where membership_id=$1', [(await member('newStaff')).id])).rows[0].count, '0');
        for (const capability of ['backoffice.personnel.write', 'backoffice.functions.invite_personnel']) {
          await db.query('delete from private.management_role_permissions where role_id=$1 and capability=$2', [roles.planning, capability]);
          await assert.rejects(bind('planning', 'newStaff'), denied);
          await db.query('insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,$3)', [tenant, roles.planning, capability]);
        }
      });
      assert.equal(await member('newStaff'), undefined);
      assert.equal((await db.query('select count(*) from public.tenant_memberships where tenant_id=$1 and user_id=$2', [foreign, actors.target.user])).rows[0].count, '0');
    });
  } finally { await db.query('rollback'); await db.end(); }
});
