import assert from "node:assert/strict";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("concurrent personnel numbers are unique, tenant-scoped and transactional", async () => {
  // Never accept a remote DATABASE_URL for this destructive fixture test.
  const local = { DB_URL: localWorkOrderTestUrl() };
  const admin = new pg.Client({ connectionString: local.DB_URL });
  const tenantId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  await admin.connect();
  try {
    await admin.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [userId, `${userId}@fieldgrid.test`]);
    await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessionId, userId]);
    await admin.query("insert into public.tenants (id, slug, name) values ($1, $2, 'Numbering concurrency test')", [tenantId, `number-test-${tenantId}`]);
    await admin.query("insert into public.tenant_settings (tenant_id) values ($1)", [tenantId]);
    await admin.query("insert into public.tenant_memberships (tenant_id, user_id, roles, status) values ($1, $2, array['tenant_admin']::public.app_role[], 'active')", [tenantId, userId]);
    const allocate = async (index, rollback = false) => {
      const client = new pg.Client({ connectionString: local.DB_URL });
      await client.connect();
      try {
        await client.query("begin");
        await client.query("set local statement_timeout = '10s'");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, session_id: sessionId, role: "authenticated" })]);
        const { rows } = await client.query("insert into public.personnel (tenant_id, full_name) values ($1, $2) returning employee_number", [tenantId, `Concurrent ${index}`]);
        await client.query(rollback ? "rollback" : "commit");
        return rows[0].employee_number;
      } finally { await client.end(); }
    };
    assert.equal(await allocate("rolled back", true), "P-0001");
    const numbers = await Promise.all(Array.from({ length: 8 }, (_, index) => allocate(index)));
    assert.deepEqual(numbers.sort(), Array.from({ length: 8 }, (_, index) => `P-${String(index + 1).padStart(4, "0")}`));
    assert.equal((await admin.query("select next_number from private.personnel_number_counters where tenant_id = $1", [tenantId])).rows[0].next_number, "9");
  } finally {
    try {
    // Only fixtures owned by this test, identified by freshly generated UUIDs.
    await admin.query("delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)", [tenantId]);
    await admin.query("delete from private.notification_templates where tenant_id=$1", [tenantId]);
    await admin.query("delete from public.tenants where id = $1", [tenantId]);
    await admin.query("delete from auth.users where id = $1", [userId]);
    } finally { await admin.end(); }
  }
});
