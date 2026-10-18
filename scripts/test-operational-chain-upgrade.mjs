import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { seedSlaFixture, slaFixture } from "./fixtures/management-sla.mjs";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const previousVersion = "20261016001315";
const ids = {
  invoice: randomUUID(),
  material: randomUUID(),
  payment: randomUUID(),
  series: randomUUID(),
};
const fixture = slaFixture();

function supabase(args, quiet = false) {
  execFileSync("pnpm", ["supabase", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "ignore", "inherit"] : "inherit",
  });
}

async function seedLegacyState() {
  const db = await workOrderTestDatabase();
  try {
    await db.query("begin");
    await seedSlaFixture(db, fixture);
    await db.query(
      "insert into public.work_order_material_usage(id,tenant_id,work_order_id,description,quantity,unit,created_by,customer_visible) values($1,$2,$3,'FICTITIOUS legacy priced material',2.500,'stuk',$4,true)",
      [ids.material, fixture.tenant, fixture.workOrder, fixture.owner],
    );
    await db.query(
      "insert into private.work_order_material_finance(tenant_id,usage_id,cost_cents,unit_price_cents) values($1,$2,210,420)",
      [fixture.tenant, ids.material],
    );
    await db.query(
      "insert into public.work_order_series(id,tenant_id,source_order_id,title,definition,timezone,created_by) values($1,$2,$3,'FICTITIOUS legacy manual series',$4,'Europe/Amsterdam',$5)",
      [ids.series, fixture.tenant, fixture.workOrder, JSON.stringify({ frequency: "weekly", interval: 1, startsOn: "2033-10-05", startsAt: "08:00", endsAt: "10:00", weekdays: [4] }), fixture.owner],
    );
    await db.query(
      "insert into public.invoices(id,tenant_id,customer_id,status,created_by) values($1,$2,$3,'draft',$4)",
      [ids.invoice, fixture.tenant, fixture.customer, fixture.owner],
    );
    await db.query(
      "insert into public.payment_attempts(id,tenant_id,provider,provider_mode,status,amount_cents,idempotency_key,provider_payload,created_by) values($1,$2,'mollie','test','failed',1234,$3,$4,$5)",
      [ids.payment, fixture.tenant, `legacy-${ids.payment}`, JSON.stringify({ historical: true }), fixture.owner],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

async function verifyUpgradedState() {
  const db = await workOrderTestDatabase();
  try {
    const material = (await db.query(
      "select m.id,m.material_id,m.material_snapshot,c.state,c.unit_price_cents,c.reviewed_by,c.reviewed_at from public.work_order_material_usage m join private.work_order_material_commercial c on c.tenant_id=m.tenant_id and c.usage_id=m.id where m.tenant_id=$1 and m.id=$2",
      [fixture.tenant, ids.material],
    )).rows[0];
    assert.equal(material.id, ids.material);
    assert.equal(material.material_id, null);
    assert.deepEqual(material.material_snapshot, {});
    assert.equal(material.state, "proposed");
    assert.equal(Number(material.unit_price_cents), 420);
    assert.equal(material.reviewed_by, null);
    assert.equal(material.reviewed_at, null);

    const series = (await db.query(
      "select id,source_order_id,lifecycle_state,automation_enabled,generation_horizon_weeks,preferred_personnel_ids from public.work_order_series where tenant_id=$1 and id=$2",
      [fixture.tenant, ids.series],
    )).rows[0];
    assert.equal(series.id, ids.series);
    assert.equal(series.source_order_id, fixture.workOrder);
    assert.equal(series.lifecycle_state, "manual");
    assert.equal(series.automation_enabled, false);
    assert.equal(series.generation_horizon_weeks, 6);
    assert.deepEqual(series.preferred_personnel_ids, []);

    const tenant = (await db.query(
      "select contract_planning_automation_enabled from public.tenant_settings where tenant_id=$1",
      [fixture.tenant],
    )).rows[0];
    assert.equal(tenant.contract_planning_automation_enabled, false);

    const assignment = (await db.query(
      "select availability_state,availability_override_reason from public.work_order_assignments where tenant_id=$1 and work_order_id=$2",
      [fixture.tenant, fixture.workOrder],
    )).rows[0];
    assert.equal(assignment.availability_state, "unknown");
    assert.equal(assignment.availability_override_reason, null);

    const order = (await db.query(
      "select required_function_id from public.work_orders where tenant_id=$1 and id=$2",
      [fixture.tenant, fixture.workOrder],
    )).rows[0];
    assert.equal(order.required_function_id, null);

    const invoice = (await db.query(
      "select id,status,customer_id from public.invoices where tenant_id=$1 and id=$2",
      [fixture.tenant, ids.invoice],
    )).rows[0];
    assert.deepEqual(invoice, { id: ids.invoice, status: "draft", customer_id: fixture.customer });

    const payment = (await db.query(
      "select id,status,merchant_profile_id,provider_payload from public.payment_attempts where tenant_id=$1 and id=$2",
      [fixture.tenant, ids.payment],
    )).rows[0];
    assert.equal(payment.id, ids.payment);
    assert.equal(payment.status, "failed");
    assert.equal(payment.merchant_profile_id, null);
    assert.deepEqual(payment.provider_payload, { historical: true });

    const version = (await db.query(
      "select version from supabase_migrations.schema_migrations where version='20261017232527'",
    )).rows[0];
    assert.equal(version.version, "20261017232527");
  } finally {
    await db.end();
  }
}

let succeeded = false;
try {
  supabase(["db", "reset", "--local", "--version", previousVersion, "--no-seed"]);
  await seedLegacyState();
  supabase(["migration", "up", "--local"]);
  await verifyUpgradedState();
  succeeded = true;
  process.stdout.write("Operationele-ketenupgrade behoudt legacy IDs en historie met gesloten defaults.\n");
} finally {
  // Leave the developer stack on the complete current schema even when an
  // assertion or intermediate migration fails.
  supabase(["db", "reset", "--local"], true);
}

if (!succeeded) process.exitCode = 1;
