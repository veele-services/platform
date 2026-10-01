import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("release gate closes staff eligibility, coworker metadata and stale-session paths", async (t) => {
  const db = await workOrderTestDatabase();
  const ids = Array.from({ length: 18 }, () => randomUUID());
  const [tenant, manager, staffA, staffB, sessionManager, sessionA, sessionB, customer, object, order,
    personA, personB, assignmentA, assignmentB, dispatchA, dispatchB, job, shift] = ids;
  const call = async (actor, session, sql, args = []) => {
    await db.query("savepoint release_gate_actor");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: "authenticated", sub: actor, session_id: session })]);
      const result = await db.query(sql, args);
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query("release savepoint release_gate_actor");
      return result.rows;
    } catch (error) {
      await db.query("rollback to savepoint release_gate_actor");
      await db.query("release savepoint release_gate_actor");
      throw error;
    }
  };
  try {
    await db.query("begin");
    for (const [user, session] of [[manager, sessionManager], [staffA, sessionA], [staffB, sessionB]]) {
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user, `${user}@release-gate.test`]);
      await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [session, user]);
    }
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS release gate')", [tenant, `release-${tenant}`]);
    await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage'])", [tenant]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['staff']::public.app_role[],'active')", [tenant, manager, staffA, staffB]);
    await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status) values($1,$3,$4,'SEC-A','FICTITIOUS staff A','active'),($2,$3,$5,'SEC-B','FICTITIOUS staff B','active')", [personA, personB, tenant, staffA, staffB]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'SEC-C','FICTITIOUS customer')", [customer, tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'SEC-O','FICTITIOUS object','{}')", [object, tenant, customer]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planning_state,published_at,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'SEC-W','FICTITIOUS','released','final',now(),now()+interval '1 hour',now()+interval '2 hours',now()+interval '1 hour',now()+interval '2 hours',$5)", [order, tenant, customer, object, manager]);
    for (const [assignment, person] of [[assignmentA, personA], [assignmentB, personB]])
      await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now()+interval '1 hour',now()+interval '2 hours',now()+interval '1 hour',now()+interval '2 hours')", [assignment, tenant, order, person]);
    for (const [dispatch, assignment, key] of [[dispatchA, assignmentA, `dispatch-${personA}`], [dispatchB, assignmentB, `dispatch-${personB}`]])
      await db.query("insert into public.dispatches(id,tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5,$6)", [dispatch, tenant, order, assignment, manager, key]);
    await db.query("insert into public.review_decisions(tenant_id,work_order_id,report_version,decision,reason,decided_by) values($1,$2,1,'returned','FICTITIOUS internal review',$3)", [tenant, order, manager]);
    await db.query("insert into public.function_catalog(id,tenant_id,name,discipline,required_certificate_codes) values($1,$2,'FICTITIOUS qualified job','FICTITIOUS',array['SEC-CERT'])", [job, tenant]);
    await db.query("insert into public.personnel_functions(tenant_id,personnel_id,function_id) values($1,$2,$3)", [tenant, personA, job]);
    await db.query("insert into public.qualifications(tenant_id,personnel_id,code,name,valid_until) values($1,$2,'SEC-CERT','FICTITIOUS certificate',current_date+30)", [tenant, personA]);
    await db.query("insert into public.open_shifts(id,tenant_id,work_order_id,function_id,starts_at,ends_at,required_certificate_codes,created_by) values($1,$2,$3,$4,now()+interval '3 hours',now()+interval '4 hours',array['SEC-CERT'],$5)", [shift, tenant, order, job, manager]);

    await t.test("only the eligible staff member sees and changes the open shift", async () => {
      const a = (await call(staffA, sessionA, "select public.staff_workspace($1) data", [tenant]))[0].data;
      const b = (await call(staffB, sessionB, "select public.staff_workspace($1) data", [tenant]))[0].data;
      assert.deepEqual(a.openShifts.map((row) => row.id), [shift]);
      assert.deepEqual(b.openShifts, []);
      await call(staffA, sessionA, "select public.set_shift_interest($1,$2,true)", [tenant, shift]);
      await assert.rejects(call(staffB, sessionB, "select public.set_shift_interest($1,$2,true)", [tenant, shift]), (error) => error.code === "42501");
      await assert.rejects(call(staffA, sessionA, "insert into public.shift_interests(tenant_id,open_shift_id,personnel_id) values($1,$2,$3)", [tenant, shift, personA]), (error) => error.code === "42501");
    });

    await t.test("coworker dispatch and internal review rows stay private", async () => {
      assert.deepEqual((await call(staffA, sessionA, "select id from public.dispatches where tenant_id=$1 order by id", [tenant])).map((row) => row.id), [dispatchA]);
      assert.deepEqual(await call(staffA, sessionA, "select id from public.review_decisions where tenant_id=$1", [tenant]), []);
      assert.equal((await call(manager, sessionManager, "select id from public.dispatches where tenant_id=$1", [tenant])).length, 2);
      assert.equal((await call(manager, sessionManager, "select id from public.review_decisions where tenant_id=$1", [tenant])).length, 1);
    });

    await t.test("revoking the live session closes direct membership reads", async () => {
      assert.equal((await call(staffA, sessionA, "select id from public.tenant_memberships where tenant_id=$1 and user_id=$2", [tenant, staffA])).length, 1);
      await db.query("delete from auth.sessions where id=$1", [sessionA]);
      assert.deepEqual(await call(staffA, sessionA, "select id from public.tenant_memberships where tenant_id=$1 and user_id=$2", [tenant, staffA]), []);
    });
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
