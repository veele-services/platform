import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("Notification delegation: isolated capabilities, exact verification, CAS and scope", async t => {
  const db = await workOrderTestDatabase();
  const tenant = randomUUID(), otherTenant = randomUUID(), people = [randomUUID(), randomUUID()];
  const users = Object.fromEntries(["admin", "ticketOnly", "target", "scoped", "platform", "platformTarget"].map(k => [k, randomUUID()]));
  const sessions = Object.fromEntries(Object.keys(users).map(k => [k, randomUUID()]));
  await db.query("begin");
  const call = async (sql, params, who = "admin", role = "authenticated") => {
    await db.query("savepoint call");
    try { await db.query(`set local role ${role}`); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[who], session_id: sessions[who], role })]); const r = await db.query(sql, params); await db.query("reset role"); await db.query("select set_config('request.jwt.claims','{}',true)"); await db.query("release savepoint call"); return r.rows[0]?.data; }
    catch (e) { await db.query("rollback to savepoint call"); await db.query("release savepoint call"); throw e; }
  };
  const query = (who = "admin", ctx = "backoffice", target = tenant) => call("select public.notification_query($1,$2,'permissions','{}') data", [target, ctx], who);
  const command = (cmd, payload, who = "admin", ctx = "backoffice", target = tenant, requestId = randomUUID()) => call("select public.notification_command($1,$2,$3,$4,$5) data", [target, ctx, cmd, payload, requestId], who);
  const verify = (op, payload, who = "admin", ctx = "backoffice", target = tenant) => call("select public.notification_verification($1,$2,$3,$4,$5,$6) data", [target, ctx, users[who], sessions[who], op, payload], who, "service_role");
  const proof = async (cmd, payload, who = "admin", ctx = "backoffice", target = tenant) => { const v = await verify("request", { action: cmd, payload, code: "739215" }, who, ctx, target); await verify("delivered", { challenge_id: v.challenge_id, delivered: true }, who, ctx, target); const c = await verify("confirm", { challenge_id: v.challenge_id, code: "739215" }, who, ctx, target); return c.verification_id; };
  const grant = async (who, capability, scope = { all: true }, platform = false) => { const m = platform ? null : (await db.query("select id from public.tenant_memberships where user_id=$1 and tenant_id=$2", [users[who], tenant])).rows[0].id; await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,$4,$5) on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set enabled=true,scope=excluded.scope", [platform ? null : tenant, users[who], m, capability, scope]); };
  let current;
  try {
    for (const [name, id] of Object.entries(users)) { await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `${name}-${id}@notification-permissions.test`]); await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [sessions[name], id]); }
    for (const id of [tenant, otherTenant]) { await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious notification scope')", [id, `notify-permission-${id}`]); await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets','planning','personeel'])", [id]); }
    for (const name of ["admin", "ticketOnly", "target", "scoped"]) await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active')", [tenant, users[name]]);
    for (const [i, name] of ["target", "scoped"].entries()) await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,$4)", [people[i], tenant, users[name], `Fictitious ${name}`]);
    await grant("admin", "notifications.permissions"); await grant("admin", "tickets.permissions"); await grant("ticketOnly", "tickets.permissions"); await grant("scoped", "notifications.permissions", { personnel_ids: [people[0]] });
    await db.query("insert into public.platform_admins(user_id) values($1),($2)", [users.platform, users.platformTarget]); await grant("platform", "platform.notifications.permissions", { tenant_ids: [tenant] }, true);

    await t.test("permission query exposes only its module; ticket grant UI cannot see notification grants", async () => {
      const data = await query(); assert(data.catalog.length > 5); assert(data.catalog.every(c => c.key.startsWith("notifications."))); assert(data.grants.every(g => g.capability.startsWith("notifications.")));
      await assert.rejects(query("ticketOnly"), e => e.code === "42501");
      const tickets = await call("select public.ticket_query($1,'tenant','config','{}') data", [tenant]); assert(tickets.catalog.every(c => c.module === "tickets")); assert(tickets.grants.every(g => !g.capability.startsWith("notifications.")));
      await assert.rejects(call("select * from private.notification_verifications", []), e => e.code === "42501");
      await assert.rejects(call("select public.notification_verification($1,'backoffice',$2,$3,'request','{}') data", [tenant, users.admin, sessions.admin]), e => e.code === "42501");
    });
    await t.test("no self expansion, no cross-module grant, and no wider delegated scope", async () => {
      const base = { user_id: users.target, capability: "notifications.send_staff", expected_revision: 0, scope: { all: true }, reason: "Fictitious delegation" };
      await assert.rejects(verify("request", { action: "grant_save", payload: { ...base, user_id: users.admin }, code: "739215" }), e => e.code === "42501");
      await assert.rejects(verify("request", { action: "grant_save", payload: { ...base, capability: "tickets.internal.read" }, code: "739215" }), e => e.code === "23514");
      await assert.rejects(verify("request", { action: "grant_save", payload: base, code: "739215" }, "ticketOnly"), e => e.code === "42501");
      await assert.rejects(verify("request", { action: "grant_save", payload: base, code: "739215" }, "scoped"), e => e.code === "42501");
      const options = await query("scoped"); assert.deepEqual(options.scope_options.personnel.map(p => p.id), [people[0]]);
    });
    await t.test("verified exact scope grants once; replay is idempotent and altered proof fails", async () => {
      const base = { user_id: users.target, capability: "notifications.send_staff", expected_revision: 0, scope: { personnel_ids: [people[0]] }, reason: "Fictitious scoped sending" };
      const verification_id = await proof("grant_save", base), key = randomUUID();
      await assert.rejects(command("grant_save", { ...base, scope: { all: true }, verification_id }), e => e.code === "42501");
      current = await command("grant_save", { ...base, verification_id }, "admin", "backoffice", tenant, key); assert(current.id); assert.equal(current.revision, 1);
      assert.deepEqual(await command("grant_save", { ...base, verification_id }, "admin", "backoffice", tenant, key), current);
      await assert.rejects(command("grant_save", { ...base, verification_id }), e => e.code === "42501");
    });
    await t.test("CAS conflict keeps current grant; wrong code persists attempts; revocation is exact", async () => {
      const base = { user_id: users.target, capability: "notifications.send_staff", expected_revision: 0, scope: { personnel_ids: [people[0]] }, reason: "Fictitious stale update" }, verification_id = await proof("grant_save", base);
      await assert.rejects(command("grant_save", { ...base, verification_id }), e => e.code === "40001");
      const revoke = { grant_id: current.id, expected_revision: current.revision, reason: "Fictitious revocation" };
      const requested = await verify("request", { action: "grant_revoke", payload: revoke, code: "739215" }); await verify("delivered", { challenge_id: requested.challenge_id, delivered: true });
      assert((await verify("confirm", { challenge_id: requested.challenge_id, code: "111111" })).error);
      assert.equal((await db.query("select attempts from private.notification_verifications where id=$1", [requested.challenge_id])).rows[0].attempts, 1);
      const verified = await verify("confirm", { challenge_id: requested.challenge_id, code: "739215" }); const r = await command("grant_revoke", { ...revoke, verification_id: verified.verification_id }); assert.equal(r.revision, 2);
      assert.equal((await db.query("select enabled from public.permission_grants where id=$1", [current.id])).rows[0].enabled, false);
    });
    await t.test("platform delegation remains within selected tenants and cannot grant tenant rights", async () => {
      const base = { user_id: users.platformTarget, capability: "platform.notifications.send", expected_revision: 0, scope: { tenant_ids: [tenant] }, reason: "Fictitious tenant-scoped platform sending" };
      const verification_id = await proof("grant_save", base, "platform", "platform", null); const r = await command("grant_save", { ...base, verification_id }, "platform", "platform", null); assert(r.id);
      await assert.rejects(verify("request", { action: "grant_save", payload: { ...base, scope: { tenant_ids: [otherTenant] } }, code: "739215" }, "platform", "platform", null), e => e.code === "42501");
      await assert.rejects(verify("request", { action: "grant_save", payload: { ...base, capability: "notifications.send_staff" }, code: "739215" }, "platform", "platform", null), e => e.code === "23514");
      assert.deepEqual((await query("platform", "platform", null)).scope_options.tenants.map(t => t.id), [tenant]);
    });
    await t.test("ticket endpoint cannot mutate notification grants even with valid ticket proof", async () => {
      const payload = { user_id: users.target, capability: "notifications.send_customers", expected_revision: 0, scope: { all: true }, reason: "Fictitious cross-module denial" };
      const ticketVerify = (op, input) => call("select public.ticket_verification($1,$2,$3,$4,$5) data", [tenant, users.ticketOnly, sessions.ticketOnly, op, input], "ticketOnly", "service_role");
      const v = await ticketVerify("request", { action: "grant_save", payload, code: "739215" }); await ticketVerify("delivered", { challenge_id: v.challenge_id, delivered: true }); const c = await ticketVerify("confirm", { challenge_id: v.challenge_id, code: "739215" });
      await assert.rejects(call("select public.ticket_command($1,'tenant','grant_save',$2,$3) data", [tenant, { ...payload, verification_id: c.verification_id }, randomUUID()], "ticketOnly"), e => e.code === "23514");
    });
  } finally { await db.query("rollback"); await db.end(); }
});
