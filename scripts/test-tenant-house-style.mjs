import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";

test("tenant house style has monotone CAS and only scoped coarse invalidation", async () => {
  const db = new pg.Client({ connectionString: localWorkOrderTestUrl() });
  await db.connect();
  await db.query("begin");
  const tenant = randomUUID(), other = randomUUID(), manager = randomUUID(), outsider = randomUUID();
  const sessions = new Map([manager, outsider].map(id => [id, randomUUID()]));
  const readRevision = async (actor = manager) => {
    await db.query("savepoint revision_read");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: "authenticated", session_id: sessions.get(actor) })]);
      const rows = (await db.query("select tenant_id,revision from public.staff_workspace_revisions where tenant_id=any($1)", [[tenant, other]])).rows;
      await db.query("rollback to savepoint revision_read");
      await db.query("release savepoint revision_read");
      return rows;
    } catch (error) {
      await db.query("rollback to savepoint revision_read");
      throw error;
    }
  };
  const source = async () => (await db.query("select updated_at::text,primary_color from public.tenant_branding where tenant_id=$1", [tenant])).rows[0];
  try {
    for (const [actor, session] of sessions) {
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [actor, `${actor}@house-style-fixture.invalid`]);
      await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [session, actor]);
    }
    for (const id of [tenant, other]) {
      await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS house style')", [id, `style-${id}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,'{}')", [id]);
      await db.query("insert into public.tenant_branding(tenant_id) values($1)", [id]);
    }
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')", [tenant, manager]);
    const initial = await source(), revision = await readRevision();
    assert.equal(revision.length, 1);
    assert.equal(revision[0].tenant_id, tenant);
    assert.deepEqual(await readRevision(outsider), []);

    await db.query("update public.tenant_branding set sender_name='FICTITIOUS new sender' where tenant_id=$1", [tenant]);
    const afterSender = await source();
    assert.notEqual(afterSender.updated_at, initial.updated_at);
    assert.deepEqual(await readRevision(), revision, "sender changes do not publish private details through a counter");

    const changed = await db.query("update public.tenant_branding set primary_color='#123456' where tenant_id=$1 and updated_at=$2 returning updated_at::text", [tenant, afterSender.updated_at]);
    assert.equal(changed.rowCount, 1);
    assert.notEqual(changed.rows[0].updated_at, afterSender.updated_at);
    assert.equal(BigInt((await readRevision())[0].revision), BigInt(revision[0].revision) + 1n);
    const stale = await db.query("update public.tenant_branding set primary_color='#ffffff' where tenant_id=$1 and updated_at=$2 returning tenant_id", [tenant, afterSender.updated_at]);
    assert.equal(stale.rowCount, 0);
    assert.equal((await source()).primary_color, "#123456");

    await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2", [tenant, manager]);
    assert.deepEqual(await readRevision(), [], "revocation removes coarse revision visibility too");
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
