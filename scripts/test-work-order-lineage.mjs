import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";
import { submitFixtureReport } from './work-order-report-fixture.mjs';

test("Work-order lineage conserves scope, historical evidence and occurrence identity", async t => {
  const db = await workOrderTestDatabase(); await db.query("begin");
  const tenant = randomUUID(), other = randomUUID(), manager = randomUUID(), staff = randomUUID(), stranger = randomUUID(), planner = randomUUID();
  const customer = randomUUID(), object = randomUUID(), order = randomUUID(), task = randomUUID();
  const sessions = Object.fromEntries([manager, staff, stranger, planner].map(id => [id, randomUUID()]));
  let serial = 0;
  const call = async (sql, args = [], actor = manager) => {
    const point = `lineage_${serial++}`;
    await db.query(`savepoint ${point}`);
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, session_id: sessions[actor], role: "authenticated" })]);
      const result = await db.query(sql, args);
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query(`release savepoint ${point}`);
      return result.rows;
    } catch (error) { await db.query(`rollback to savepoint ${point}`); await db.query(`release savepoint ${point}`); throw error; }
  };
  const command = async (kind, input, id = randomUUID(), actor = manager) => (await call("select public.work_order_related_command($1,$2,$3,$4) result", [tenant, id, kind, input], actor))[0].result;
  const context = async (id = order, actor = manager) => (await call("select public.work_order_related_context($1,$2) result", [tenant, id], actor))[0].result;
  const version = async (id = order) => (await db.query("select version from public.work_orders where id=$1", [id])).rows[0].version;
  const input = async (amount, overrides = {}) => ({ orderId: order, version: Number(await version()), title: "FICTITIOUS transferred remainder", instructions: "FICTITIOUS test scope", reason: "remainder", requestedDate: "", copyTemplate: true, copyContacts: true, copyPersonnel: false, tasks: [{ id: task, quantity: amount }], ...overrides });
  const seriesCommand = async (kind, payload, id = randomUUID()) => (await call("select public.work_order_series_command($1,$2,$3,$4) result", [tenant, id, kind, payload]))[0].result;
  try {
    for (const actor of [manager, staff, stranger, planner]) {
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [actor, `${actor}@lineage.test`]);
      await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [sessions[actor], actor]);
    }
    for (const id of [tenant, other]) {
      await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS lineage tenant')", [id, `lineage-${id}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services,signature_required_default) values($1,array['planning','personeel','finance','rapportage'],false)", [id]);
      await db.query("insert into public.tenant_branding(tenant_id) values($1)", [id]);
    }
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner','finance']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($4,$5,array['tenant_admin']::public.app_role[],'active')", [tenant, manager, staff, other, stranger]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active')", [tenant, planner]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'LINEAGE-C','FICTITIOUS customer')", [customer, tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'LINEAGE-O','FICTITIOUS object','{}')", [object, tenant, customer]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,title,created_by,planning_state) values($1,$2,$3,$4,'LINEAGE-W','Onderhoud','FICTITIOUS source',$5,'unassigned')", [order, tenant, customer, object, manager]);
    await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions) values($1,$2,$3,'LINEAGE','FICTITIOUS task',15,10,'stuk',1500,2100,'FICTITIOUS instruction')", [task, tenant, order]);
    const contact = randomUUID(), checklist = randomUUID(), template = randomUUID(), revision = randomUUID();
    await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name) values($1,$2,$3,'FICTITIOUS site contact')", [contact, tenant, customer]);
    await db.query("insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot) values($1,$2,$3,array['site'],'{\"name\":\"FICTITIOUS site contact\"}')", [tenant, order, contact]);
    await db.query("insert into public.work_order_templates(id,tenant_id,name,kind,created_by) values($1,$2,'FICTITIOUS checklist','checklist',$3)", [template, tenant, manager]);
    await db.query("insert into public.work_order_template_versions(id,tenant_id,template_id,version,state,definition,created_by) values($1,$2,$3,1,'published','{\"questions\":[{\"id\":\"check\",\"label\":\"FICTITIOUS check\",\"type\":\"check\",\"required\":true}]}',$4)", [revision, tenant, template, manager]);
    await db.query("insert into public.work_order_checklists(id,tenant_id,work_order_id,template_revision_id,name,definition) select $1,$2,$3,id,'FICTITIOUS checklist',definition from public.work_order_template_versions where id=$4", [checklist, tenant, order, revision]);
    await db.query("insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,updated_by) values($1,$2,'check','true',$3)", [tenant, checklist, manager]);

    let child;
    await t.test("scope transfer is atomic, exact-once and preserves the original task", async () => {
      const payload = await input(4), key = randomUUID();
      child = (await command("split", payload, key)).id;
      assert.equal((await command("split", payload, key)).id, child);
      await assert.rejects(command("split", { ...payload, title: "Changed retry" }, key), error => error.code === "23514");
      const source = (await db.query("select quantity,transferred_quantity,scope_root_task_id,completed_at from public.work_order_tasks where id=$1", [task])).rows[0];
      assert.equal(Number(source.quantity), 10); assert.equal(Number(source.transferred_quantity), 4); assert.equal(source.scope_root_task_id, task); assert.equal(source.completed_at, null);
      const copied = (await db.query("select quantity,scope_root_task_id,instructions,completed_at,executed_quantity from public.work_order_tasks where work_order_id=$1", [child])).rows[0];
      assert.equal(Number(copied.quantity), 4); assert.equal(copied.scope_root_task_id, task); assert.equal(copied.instructions, "FICTITIOUS instruction"); assert.equal(copied.completed_at, null); assert.equal(copied.executed_quantity, null);
      const childChecklist = (await db.query("select id,template_revision_id from public.work_order_checklists where work_order_id=$1", [child])).rows[0];
      assert.notEqual(childChecklist.id, checklist); assert.equal(childChecklist.template_revision_id, revision);
      assert.equal((await db.query("select count(*)::int n from public.work_order_checklist_answers where checklist_id=$1", [childChecklist.id])).rows[0].n, 0);
      assert.equal((await db.query("select contact_id from public.work_order_contacts where work_order_id=$1", [child])).rows[0].contact_id, contact);
      assert.equal((await context()).tasks[0].available, 6);
      await assert.rejects(command("split", await input(7)), error => error.code === "23514");
      assert.equal((await context()).tasks[0].available, 6);
      // Even a direct privileged write cannot inflate a transferred root's price.
      await db.query('savepoint frozen_root');
      await assert.rejects(db.query('update public.work_order_tasks set unit_price_cents=2500 where id=$1',[task]),error=>error.code==='23514');
      await db.query('rollback to savepoint frozen_root');
      await assert.rejects(db.query('update public.work_order_tasks set quantity=12 where id=$1',[task]),error=>error.code==='23514');
      await db.query('rollback to savepoint frozen_root');await db.query('release savepoint frozen_root');
    });

    await t.test("split depth, tenant access and direct transfer bypasses fail closed", async () => {
      const childTask = (await db.query("select id from public.work_order_tasks where work_order_id=$1", [child])).rows[0].id;
      await assert.rejects(command("split", await input(1, { orderId: child, version: Number(await version(child)), tasks: [{ id: childTask, quantity: 1 }] })), error => error.code === "23514");
      await assert.rejects(context(order, staff), error => error.code === "42501");
      await assert.rejects(context(order, stranger), error => error.code === "42501");
      await assert.rejects(command("duplicate", await input(1), randomUUID(), stranger), error => error.code === "42501");
      await assert.rejects(call("insert into public.work_order_scope_transfers(tenant_id,source_task_id,target_task_id,target_order_id,quantity,reason,created_by) values($1,$2,$3,$4,1,'forged',$5)", [tenant, task, randomUUID(), child, manager]), error => error.code === "42501");
      await assert.rejects(call("update public.work_order_tasks set transferred_quantity=0 where id=$1", [task]), error => error.code === "23514" || error.code === "42501");
    });

    await t.test("duplicate and warranty have fresh execution and no copied price entitlement", async () => {
      const duplicated = await command("duplicate", await input(10));
      const warranty = await command("followup", await input(2, { reason: "warranty" }));
      for (const id of [duplicated.id, warranty.id]) {
        const copied = (await db.query("select id,scope_root_task_id,unit_price_cents,completed_at,commercial_snapshot from public.work_order_tasks where work_order_id=$1", [id])).rows[0];
        assert.equal(copied.id, copied.scope_root_task_id); assert.equal(Number(copied.unit_price_cents), 0); assert.equal(copied.completed_at, null); assert.deepEqual(copied.commercial_snapshot, {});
        assert.equal((await db.query("select count(*)::int n from public.report_entries where work_order_id=$1", [id])).rows[0].n, 0);
      }
      await assert.rejects(command("followup", await input(1, { reason: "paid", acceptedQuoteId: randomUUID() })), error => error.code === "23514");
    });

    await t.test("material usage is retry-safe and unavailable through direct table APIs", async () => {
      const key = randomUUID(), payload = { orderId: order, version: Number(await version()), description: "FICTITIOUS cleaning cloth", quantity: 2, unit: "stuk", taskId: task, unitPriceCents: 150, costCents: 50 };
      const first = await command("material", payload, key); assert.deepEqual(await command("material", payload, key), first);
      assert.equal((await context()).materials.length, 1);
      const limited = await context(order, planner);
      assert.equal(limited.canFinance, false); assert.equal("unitPriceCents" in limited.materials[0], false); assert.equal("costCents" in limited.materials[0], false);
      await assert.rejects(command("material", payload, randomUUID(), planner), error => error.code === "42501");
      await assert.rejects(call("select * from public.work_order_material_usage", [], staff), error => error.code === "42501");
    });

    await t.test("execution after transfer uses only own scope, supports N/A, and records exact crew contributions", async () => {
      const person = randomUUID(), outsider = randomUUID(), assignment = randomUUID();
      await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS contributor')", [person, tenant, staff]);
      await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'FICTITIOUS non-crew employee')", [outsider, tenant]);
      await db.query("update public.work_orders set planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour',status='in_progress' where id=$1", [order]);
      await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,actual_start_at,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'in_progress',now(),now(),now()+interval '1 hour',now(),now()+interval '1 hour')", [assignment, tenant, order, person]);
      await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)", [tenant, order, assignment, manager, randomUUID()]);
      const taskVersion = async () => (await db.query("select execution_version from public.work_order_tasks where id=$1", [task])).rows[0].execution_version;
      const execute = async (state, amount, note = "FICTITIOUS result") => call("select public.record_task_execution($1,$2,$3,$4,$5,$6)", [tenant, task, await taskVersion(), state, amount, note], staff);
      await assert.rejects(call("select public.assign_work_order_task($1,$2,$3,$4)", [tenant, task, await taskVersion(), outsider]), error => error.code === "23514");
      await assert.rejects(call("select public.assign_work_order_task($1,$2,$3,$4)", [tenant, task, await taskVersion(), person], staff), error => error.code === "42501");
      await call("select public.assign_work_order_task($1,$2,$3,$4)", [tenant, task, await taskVersion(), person]);
      await execute('in_progress', 2);
      let row = (await db.query("select * from public.work_order_tasks where id=$1", [task])).rows[0];
      assert.equal(row.completed_at, null);assert.equal(row.execution_state, 'in_progress');assert.equal(Number(row.executed_quantity),2);
      assert.equal((await context()).tasks[0].available,4);
      await assert.rejects(execute('completed', 10), error => error.code === '23514');
      await assert.rejects(execute('not_applicable', 0, ''), error => error.code === '23514');
      await execute('not_applicable', 0, 'FICTITIOUS not applicable reason');
      row = (await db.query("select * from public.work_order_tasks where id=$1", [task])).rows[0];
      assert.ok(row.completed_at);assert.equal(row.execution_state,'not_applicable');assert.equal(Number(row.executed_quantity),0);
      await execute('completed', 6);
      await call("select public.complete_work_order_task($1,false,null)",[task],staff);
      const result = (await call("select to_jsonb(public.complete_work_order_task($1,true,'FICTITIOUS own scope')) result", [task], staff))[0].result;
      assert.equal(result.executed_quantity,6);assert.equal(result.unit_price_cents,0);assert.deepEqual(result.commercial_snapshot,{});
      const collaboration = (await call("select public.work_order_task_context($1,$2) result", [tenant,task],staff))[0].result;
      assert.equal(collaboration.assignedPersonnelId,person);assert.equal(collaboration.crew.length,1);assert.equal(collaboration.contributions.length,5);
      assert.equal(collaboration.contributions[0].toQuantity,6);assert.equal(JSON.stringify(collaboration).includes('unit_price'),false);
      await assert.rejects(call("select public.work_order_task_context($1,$2)",[tenant,task],stranger),error=>error.code==='42501');
      await assert.rejects(call("insert into public.work_order_task_contributions(tenant_id,task_id,actor_id,execution_version,from_quantity,to_quantity,result) values($1,$2,$3,100,0,100,'completed')",[tenant,task,staff],staff),error=>error.code==='42501');
    });

    await t.test("split performances share the original fixed-price entitlement and preserve allocated history", async () => {
      const childTask = (await db.query("select id from public.work_order_tasks where work_order_id=$1", [child])).rows[0].id;
      await db.query("update public.work_order_tasks set executed_quantity=case when id=$1 then 6 else 4 end,completed_at=clock_timestamp(),execution_state=case when id=$1 then 'partial' else 'completed' end where id=any($2)", [task, [task, childTask]]);
      await db.query("update public.work_orders set planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour',status='invoice_ready' where id=any($1)", [[order, child]]);
      const invoice = randomUUID();
      await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by) values($1,$2,$3,$4)", [invoice, tenant, customer, manager]);
      const allocate = async (orderId, taskId, quantity) => db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents) values($1,$2,$3,$4,'FICTITIOUS scope allocation',$5,'stuk',1500,0,2100,0,0)", [tenant, invoice, orderId, taskId, quantity]);
      await allocate(order, task, 6); await allocate(child, childTask, 4);
      const sum = (await db.query("select sum(quantity) quantity,sum(subtotal_cents) cents from public.invoice_lines where invoice_id=$1", [invoice])).rows[0];
      assert.equal(Number(sum.quantity), 10); assert.equal(Number(sum.cents), 15000);
      assert.equal((await db.query("select count(distinct source_snapshot->>'scope_root_task_id')::int n from public.invoice_lines where invoice_id=$1", [invoice])).rows[0].n, 1);
      await db.query("savepoint rejected_allocation");
      await assert.rejects(allocate(child, childTask, 1), error => error.code === "23514");
      await db.query("rollback to savepoint rejected_allocation");
      // Historical allocated quantity and source ID cannot be rewritten by splitting.
      await assert.rejects(command("split", await input(1)), error => error.code === "23514");
      assert.equal((await db.query("select count(*)::int n from public.invoice_lines where invoice_id=$1", [invoice])).rows[0].n, 2);
    });

    await t.test("a partially invoiced source transfers only its unperformed remainder and cannot bill the root twice", async () => {
      const source=randomUUID(), root=randomUUID();
      await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,title,created_by,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,$5,'Onderhoud','FICTITIOUS partial invoice',$6,'in_progress',now(),now()+interval '1 hour',now(),now()+interval '1 hour')",[source,tenant,customer,object,`PARTIAL-${source}`,manager]);
      await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,'PARTIAL','FICTITIOUS root entitlement',10,10,'stuk',1000,2100)",[root,tenant,source]);
      await call("select public.record_task_execution($1,$2,1,'partial',4,'Six units remain for a followup')",[tenant,root]);
      await submitFixtureReport(db,call,{tenant,order:source,staff,manager});
      await call("select public.review_work_order($1,'approved',null)",[source]);
      const allocate=async(id,quantity)=>(await call("select (public.create_execution_invoice($1,$2,$3)).*",[tenant,randomUUID(),JSON.stringify([{taskId:id,quantity}])]))[0];
      const first=await allocate(root,2);
      const historical=(await db.query("select source_snapshot from public.invoice_lines where invoice_id=$1",[first.id])).rows[0].source_snapshot;
      const sourceReport=(await db.query("select snapshot from public.work_order_report_versions where work_order_id=$1",[source])).rows[0].snapshot;
      const follow=(await command('followup',await input(6,{orderId:source,version:Number(await version(source)),tasks:[{id:root,quantity:6}],copyTemplate:false}))).id;
      const transferred=(await db.query("select id,scope_root_task_id from public.work_order_tasks where work_order_id=$1",[follow])).rows[0];
      assert.equal(transferred.scope_root_task_id,root);
      assert.deepEqual((await db.query("select source_snapshot from public.invoice_lines where invoice_id=$1",[first.id])).rows[0].source_snapshot,historical);
      assert.deepEqual((await db.query("select snapshot from public.work_order_report_versions where work_order_id=$1",[source])).rows[0].snapshot,sourceReport);
      await allocate(root,2);
      await assert.rejects(allocate(root,1),error=>error.code==='23514');
      await db.query("update public.work_orders set planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour',status='in_progress' where id=$1",[follow]);
      await call("select public.record_task_execution($1,$2,1,'completed',6,'FICTITIOUS completed remainder')",[tenant,transferred.id]);
      await submitFixtureReport(db,call,{tenant,order:follow,staff,manager});
      await call("select public.review_work_order($1,'approved',null)",[follow]);
      await allocate(transferred.id,6);
      const total=(await db.query("select sum(quantity) q,sum(subtotal_cents) cents from public.invoice_lines where source_snapshot->>'scope_root_task_id'=$1",[root])).rows[0];
      assert.equal(Number(total.q),10);assert.equal(Number(total.cents),10000);
      await assert.rejects(allocate(transferred.id,1),error=>error.code==='23514');
    });

    await t.test("six-week generator is repeatable and preserves skipped and manually moved visits", async () => {
      const base = (await command("duplicate", await input(2))).id;
      const today = (await db.query("select (clock_timestamp() at time zone 'Europe/Amsterdam')::date::text as business_day")).rows[0].business_day;
      const definition = { startsOn: today, endsOn: "", frequency: "daily", interval: 1, weekdays: [1], monthlyMode: "date", monthDay: 1, monthPosition: 1, monthWeekday: 1, startsAt: "08:00", endsAt: "10:00", requiredPersonnel: 2 };
      const series = await seriesCommand("create", { orderId: base, version: Number(await version(base)), title: "FICTITIOUS recurrence", definition });
      await seriesCommand("skip", { seriesId: series.id, version: 1, day: today, reason: "FICTITIOUS agreed exception" });
      const generated = await seriesCommand("generate", { seriesId: series.id, version: 1 }); assert.equal(generated.created, 41);
      const repeated = await seriesCommand("generate", { seriesId: series.id, version: 1 }); assert.equal(repeated.created, 0);
      const dates = (await db.query("select occurrence_on::text as business_day,state,work_order_id from public.work_order_occurrences where series_id=$1 order by occurrence_on", [series.id])).rows;
      assert.equal(dates.length, 42); assert.equal(dates[0].state, "skipped");
      const changed = dates[1].work_order_id;
      await db.query("update public.work_orders set day_instructions='FICTITIOUS local override',version=version+1 where id=$1", [changed]);
      const updated = await seriesCommand("update", { seriesId: series.id, version: 1, title: "FICTITIOUS changed recurrence", definition: { ...definition, requiredPersonnel: 3 }, applyFuture: true });
      assert.equal(updated.preserved, 1);
      assert.equal((await db.query("select required_personnel,day_instructions from public.work_orders where id=$1", [changed])).rows[0].required_personnel, 2);
      assert.equal((await db.query("select count(*)::int n from public.work_order_occurrences where series_id=$1 and state='skipped'", [series.id])).rows[0].n, 1);
      await assert.rejects(seriesCommand("skip", { seriesId: series.id, version: 2, day: dates[1].business_day, reason: "Do not overwrite manual changes" }), error => error.code === "23514");
    });
  } finally { await db.query("rollback"); await db.end(); }
});
