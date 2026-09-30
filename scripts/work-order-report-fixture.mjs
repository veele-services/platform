import { randomUUID } from "node:crypto";

// Give a domain-test fixture a real, published, completed staff assignment.
// The report itself is always submitted through the authenticated staff RPC;
// never insert an approved report or bypass its review/signature checks.
export async function submitFixtureReport(db, call, { tenant, order, staff, manager }) {
  let person = (await db.query("select id from public.personnel where tenant_id=$1 and user_id=$2", [tenant, staff])).rows[0]?.id;
  if (!person) {
    person = randomUUID();
    await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS report employee')", [person, tenant, staff]);
  }
  let assignment = (await db.query("select id from public.work_order_assignments where tenant_id=$1 and work_order_id=$2 and personnel_id=$3", [tenant, order, person])).rows[0]?.id;
  if (!assignment) {
    assignment = randomUUID();
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) select $1,tenant_id,id,$2,'completed',planned_start_at,planned_end_at,projected_start_at,projected_end_at from public.work_orders where id=$3", [assignment, person, order]);
    await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)", [tenant, order, assignment, manager, randomUUID()]);
  } else {
    await db.query("update public.work_order_assignments set status='completed',actual_end_at=clock_timestamp() where id=$1", [assignment]);
  }
  const version = (await db.query("select version from public.work_orders where id=$1", [order])).rows[0].version;
  return call("select public.submit_work_order_report($1,$2,$3,$4)", [order, version, "FICTITIOUS completed scope recorded for review", randomUUID()], staff);
}
