import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("Tickets: current identity, exact scope, audience projections and atomic commands", async t => {
  const db = await workOrderTestDatabase();
  await db.query("begin");
  const tenant = randomUUID(), otherTenant = randomUUID();
  const users = Object.fromEntries(["admin", "staff", "coworker", "planner", "finance", "hr", "platform", "support", "outsider"].map(k => [k, randomUUID()]));
  const sessions = Object.fromEntries(Object.values(users).map(id => [id, randomUUID()]));
  const people = { staff: randomUUID(), coworker: randomUUID() };
  const customer = randomUUID(), object = randomUUID(), workOrder = randomUUID();
  const call = async (sql, params = [], who = "staff", role = "authenticated") => {
    await db.query("savepoint operation");
    try {
      await db.query(`set local role ${role}`);
      // Owner-only fixture maintenance is not an authenticated user request.
      // In particular a cascade has already removed the parent tenant when
      // child guards execute; do not impersonate its now-inactive membership.
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(role === "postgres" ? {} : { sub: users[who], session_id: sessions[users[who]], role })]);
      const result = await db.query(sql, params);
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query("release savepoint operation");
      return result.rows[0]?.data ?? result.rows;
    } catch (error) {
      await db.query("rollback to savepoint operation");
      await db.query("release savepoint operation");
      throw error;
    }
  };
  const query = (operation, payload = {}, who = "staff", ctx = "staff", scope = tenant) => call("select public.ticket_query($1,$2,$3,$4) data", [scope, ctx, operation, payload], who);
  const command = (kind, payload, who = "staff", ctx = "staff", request = randomUUID(), scope = tenant) => call("select public.ticket_command($1,$2,$3,$4,$5) data", [scope, ctx, kind, payload, request], who);
  const grant = async (who, capability, scope = { all: true }, platform = false) => {
    const membership = platform ? null : (await db.query("select id from public.tenant_memberships where tenant_id=$1 and user_id=$2", [tenant, users[who]])).rows[0].id;
    await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,$4,$5) on conflict (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set scope=excluded.scope,enabled=true", [platform ? null : tenant, users[who], membership, capability, scope]);
  };
  let category, hrCategory, supportCategory, first, hrTicket;
  try {
    // Supabase's session pooler can expose an unset request claim as an empty
    // string. Owner fixture setup must remain safe while user calls fail closed.
    await db.query("select set_config('request.jwt.claims','',true)");
    for (const [name, id] of Object.entries(users)) {
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `${name}-${id}@tickets.test`]);
      await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [sessions[id], id]);
    }
    for (const id of [tenant, otherTenant]) {
      await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious ticket tenant')", [id, `tickets-${id}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','tickets'])", [id]);
    }
    for (const who of ["admin", "staff", "coworker", "planner", "finance", "hr", "support"]) {
      const role = who === "admin" ? "tenant_admin" : ["planner", "finance", "hr"].includes(who) ? who : "staff";
      await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')", [tenant, users[who], role]);
    }
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')", [otherTenant, users.outsider]);
    for (const who of ["staff", "coworker"]) await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,$4)", [people[who], tenant, users[who], `Fictitious ${who}`]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'TICKET-CUSTOMER','Fictitious contextual customer')", [customer, tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'TICKET-OBJECT','Fictitious contextual object',$4)", [object, tenant, customer, { street: "Fictitious street", access_code: "OBJECT-PRIVATE-CANARY" }]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'TICKET-WORK-ORDER','Fictitious context visit','Onderhoud','released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z',$5)", [workOrder, tenant, customer, object, users.admin]);
    for (const who of ["staff", "coworker"]) {
      const assignment = (await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z') returning id", [tenant, workOrder, people[who]])).rows[0].id;
      await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)", [tenant, workOrder, assignment, users.admin, randomUUID()]);
    }
    await db.query("select private.ticket_seed_membership(id) from public.tenant_memberships where tenant_id=$1", [tenant]);
    await db.query("insert into public.platform_admins(user_id) values($1)", [users.platform]);
    category = (await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'", [tenant])).rows[0].id;
    hrCategory = (await db.query("select id from public.ticket_categories where tenant_id=$1 and code='hr'", [tenant])).rows[0].id;
    supportCategory = (await db.query("select id from public.ticket_categories where route='platform_support' and code='technical'")).rows[0].id;

    await t.test("staff owns its ticket; raw APIs, colleagues and platform admin fail closed", async () => {
      const payload = { title: "Fictitious planning issue", body: "Public fixture message", category_id: category, urgency: "normal", work_order_id: workOrder, technical_context: { environment: "local", release: "local" } };
      const request = randomUUID();
      first = await command("create", payload, "staff", "staff", request);
      assert.equal(first.title, payload.title);
      assert.equal(first.context_links.find(x => x.kind === "work_order").href, `/staff?workOrder=${workOrder}`);
      assert.equal(JSON.stringify(first).includes("OBJECT-PRIVATE-CANARY"), false);
      assert.equal((await command("create", payload, "staff", "staff", request)).id, first.id);
      await assert.rejects(command("create", { ...payload, body: "Different payload" }, "staff", "staff", request), e => e.code === "23505");
      await assert.rejects(query("detail", { ticket_id: first.id }, "coworker"), e => e.code === "42501");
      await assert.rejects(query("detail", { ticket_id: first.id }, "platform", "platform", null), e => e.code === "42501");
      assert.equal((await query("list", {}, "coworker")).total, 0);
      for (const table of ["tickets", "ticket_messages", "ticket_events", "permission_grants"]) await assert.rejects(call(`select * from public.${table}`), e => e.code === "42501");
      await assert.rejects(command("create", payload, "staff", "staff", randomUUID(), otherTenant), e => e.code === "42501");
    });
    await t.test("hidden tenant note cannot change staff content, revision, activity, search or unread", async () => {
      first = await command("read", { ticket_id: first.id, expected_revision: first.revision });
      const visible = await query("detail", { ticket_id: first.id });
      const handler = await query("detail", { ticket_id: first.id }, "planner", "tenant");
      await command("reply", { ticket_id: first.id, expected_revision: handler.revision, audience: "tenant", body: "PRIVATE-NOTE-CANARY" }, "planner", "tenant");
      const after = await query("detail", { ticket_id: first.id });
      assert.equal(after.revision, visible.revision); assert.equal(after.updated_at, visible.updated_at); assert.equal(after.unread, false);
      assert.equal(JSON.stringify(after).includes("PRIVATE-NOTE-CANARY"), false);
      assert.equal((await query("list", { search: "PRIVATE-NOTE-CANARY" })).total, 0);
      assert.equal((await query("list", { search: "PRIVATE-NOTE-CANARY" }, "planner", "tenant")).total, 1);
      const replied = await command("reply", { ticket_id: first.id, expected_revision: after.revision, audience: "reporter", body: "Reporter reply after hidden note" });
      assert.equal(replied.messages.length, 2);
      await assert.rejects(command("reply", { ticket_id: first.id, expected_revision: after.revision, body: "Stale reply" }), e => e.code === "40001");
    });
    await t.test("HR needs its separate exact record scope, even next to broad planning", async () => {
      hrTicket = await command("create", { title: "Fictitious HR issue", body: "CONFIDENTIAL-HR-CANARY", category_id: hrCategory });
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "admin", "tenant"), e => e.code === "42501");
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "planner", "tenant"), e => e.code === "42501");
      await grant("planner", "tickets.internal.hr", { personnel_ids: [people.coworker] });
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "planner", "tenant"), e => e.code === "42501");
      await grant("planner", "tickets.internal.hr", { personnel_ids: [people.staff] });
      assert.equal((await query("detail", { ticket_id: hrTicket.id }, "planner", "tenant")).id, hrTicket.id);
      await db.query("update public.permission_grants set enabled=false where tenant_id=$1 and user_id=$2 and capability='tickets.internal.hr'", [tenant, users.planner]);
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "planner", "tenant"), e => e.code === "42501");
      // Fixture setup for a historical combined role, not an authenticated
      // bypass of the new management-role command boundary.
      await db.query("update public.tenant_memberships set roles=array['tenant_admin','hr']::public.app_role[] where tenant_id=$1 and user_id=$2", [tenant, users.admin]);
      await db.query("select private.ticket_seed_membership(id) from public.tenant_memberships where tenant_id=$1 and user_id=$2", [tenant, users.admin]);
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "admin", "tenant"), e => e.code === "42501");
      assert.equal(JSON.stringify(await query("list", {}, "admin", "tenant")).includes("CONFIDENTIAL-HR-CANARY"), false);
    });
    await t.test("assignment cannot grant access and route changes preserve confidentiality", async () => {
      const handler = await query("detail", { ticket_id: first.id }, "planner", "tenant");
      await assert.rejects(command("assign", { ticket_id: first.id, expected_revision: handler.revision, assigned_user_id: users.coworker }, "planner", "tenant"), e => e.code === "42501");
      const hr = await query("detail", { ticket_id: hrTicket.id }, "hr", "tenant");
      await assert.rejects(command("category", { ticket_id: hrTicket.id, expected_revision: hr.revision, category_id: category, reason: "Do not lower confidentiality" }, "hr", "tenant"), e => e.code === "23514");
    });
    await t.test("session and membership revocation apply to an already issued JWT", async () => {
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [sessions[users.staff]]);
      await assert.rejects(query("detail", { ticket_id: first.id }), e => e.code === "42501");
      await db.query("update auth.sessions set not_after=null where id=$1", [sessions[users.staff]]);
      await db.query("update public.tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2", [tenant, users.staff]);
      await assert.rejects(query("detail", { ticket_id: first.id }), e => e.code === "42501");
      await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2", [tenant, users.staff]);
    });
    const verify = async (kind, payload, who = "admin") => {
      const request = await call("select public.ticket_verification($1,$2,$3,'request',$4) data", [tenant, users[who], sessions[users[who]], { action: kind, payload, code: "734821" }], who, "service_role");
      await call("select public.ticket_verification($1,$2,$3,'delivered',$4) data", [tenant, users[who], sessions[users[who]], { challenge_id: request.challenge_id, delivered: true }], who, "service_role");
      const confirmed = await call("select public.ticket_verification($1,$2,$3,'confirm',$4) data", [tenant, users[who], sessions[users[who]], { challenge_id: request.challenge_id, code: "734821" }], who, "service_role");
      return confirmed.verification_id;
    };
    await t.test("configuration and personal preferences do not disclose ticket contents", async () => {
      const staffSettings = await query("config");
      assert.deepEqual(staffSettings.categories, []); assert.equal(staffSettings.permissions.configure, false);
      const config = await query("config", {}, "admin", "tenant");
      assert.ok(config.catalog.find(p => p.key === "tickets.internal.hr").sensitive);
      assert.equal(JSON.stringify(config).includes("CONFIDENTIAL-HR-CANARY"), false);
      const payload = { expected_revision: config.settings.revision, timezone: "Europe/Amsterdam", opening_hours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" } };
      await command("settings_save", payload, "admin", "tenant");
      await assert.rejects(command("settings_save", payload, "admin", "tenant"), e => e.code === "40001");
      await assert.rejects(command("settings_save", { timezone: "Europe/Amsterdam", opening_hours: payload.opening_hours }, "admin", "tenant"), e => e.code === "40001");
      const group = await command("group_save", { name: "Fictitious planning intake", member_ids: [users.planner], active: true }, "admin", "tenant");
      const beforeCategory = config.categories.find(c => c.id === category);
      const categoryPayload = { category_id: category, expected_revision: beforeCategory.revision, name: "Fictitious operational category", description: "Fictitious configuration", active: true, response_minutes: 120, followup_minutes: 960, group_id: group.id, default_assignee_id: users.planner, sort_order: 1, pause_while_waiting: true, can_escalate: true, confidential: false };
      await command("category_save", categoryPayload, "admin", "tenant");
      await assert.rejects(command("category_save", categoryPayload, "admin", "tenant"), e => e.code === "40001");
      const updated = await query("config", {}, "admin", "tenant");
      assert.equal(updated.categories.find(c => c.id === category).response_minutes, 120);
      assert.ok(updated.groups.some(g => g.id === group.id && g.member_ids.includes(users.planner)));
      assert.ok(updated.audit.some(a => a.action === "category_save" && a.label && a.actor_name));
    });
    await t.test("sensitive delegation binds exact payload and session; no self-grant", async () => {
      const payload = { user_id: users.support, capability: "tickets.support.read", scope: { all: true }, expected_revision: 0, reason: "Fictitious support contact delegation" };
      await assert.rejects(command("grant_save", payload, "admin", "tenant"), e => e.code === "42501");
      const verified = await verify("grant_save", payload);
      await assert.rejects(command("grant_save", { ...payload, capability: "tickets.internal.hr", verification_id: verified }, "admin", "tenant"), e => e.code === "42501");
      await command("grant_save", { ...payload, verification_id: verified }, "admin", "tenant");
      await assert.rejects(command("grant_save", { ...payload, verification_id: verified }, "admin", "tenant"), e => e.code === "42501");
      const own = { ...payload, user_id: users.admin, capability: "tickets.internal.hr" };
      const selfVerification = await verify("grant_save", own);
      await assert.rejects(command("grant_save", { ...own, verification_id: selfVerification }, "admin", "tenant"), e => e.code === "42501");
      assert.equal((await query("access", {}, "support", "support")).allowed, true);
    });
    await t.test("controlled transfer shares only selected text and keeps independent histories", async () => {
      for (const cap of ["tickets.internal.share", "tickets.support.create", "tickets.support.read", "tickets.support.reply", "tickets.support.manage"]) await grant("admin", cap);
      for (const cap of ["platform.support.read", "platform.support.reply", "platform.support.note", "platform.support.manage"]) await grant("platform", cap, { all: true }, true);
      const source = await query("detail", { ticket_id: first.id }, "admin", "tenant");
      const shared = await command("transfer", { ticket_id: source.id, expected_revision: source.revision, category_id: supportCategory, title: "Selected technical question", body: "ONLY-EXPLICITLY-SHARED-TEXT", attachment_ids: [] }, "admin", "tenant");
      const refreshedSource = await query("detail", { ticket_id: first.id }, "admin", "tenant");
      const reused = await command("transfer", { ticket_id: source.id, expected_revision: refreshedSource.revision, category_id: supportCategory, title: "Never replace existing summary", body: "NEVER-SILENTLY-OVERWRITE", attachment_ids: [] }, "admin", "tenant");
      assert.equal(reused.id, shared.id); assert.equal(JSON.stringify(reused).includes("NEVER-SILENTLY-OVERWRITE"), false);
      const view = await query("detail", { ticket_id: shared.id }, "platform", "platform", null);
      assert.equal(view.messages[0].body, "ONLY-EXPLICITLY-SHARED-TEXT");
      assert.equal(view.messages.length, 1); assert.equal(view.source_ticket, undefined); assert.equal(view.linked_support, undefined);
      assert.equal(JSON.stringify(view).includes(first.id), false); assert.equal(JSON.stringify(view).includes("PRIVATE-NOTE-CANARY"), false);
      const platformNote = await command("reply", { ticket_id: shared.id, expected_revision: view.revision, audience: "platform", body: "PRIVATE-PLATFORM-CANARY" }, "platform", "platform", randomUUID(), null);
      assert.equal(JSON.stringify(await query("detail", { ticket_id: shared.id }, "admin", "support")).includes("PRIVATE-PLATFORM-CANARY"), false);
      const answer = await command("reply", { ticket_id: shared.id, expected_revision: platformNote.revision, audience: "reporter", body: "Safe public support answer" }, "platform", "platform", randomUUID(), null);
      const draft = await query("response_draft", { ticket_id: shared.id, message_id: answer.messages.at(-1).id }, "admin", "support");
      assert.equal(draft.source_ticket_id, first.id); assert.equal(draft.body, "Safe public support answer");
      assert.equal((await query("detail", { ticket_id: first.id })).messages.some(m => m.body === draft.body), false);
      const before = (await query("detail", { ticket_id: first.id })).status;
      await command("status", { ticket_id: shared.id, expected_revision: answer.revision, status: "resolved", resolution: "Fictitious technical solution" }, "platform", "platform", randomUUID(), null);
      assert.equal((await query("detail", { ticket_id: first.id })).status, before);
      const hrView = await query("detail", { ticket_id: hrTicket.id }, "hr", "tenant");
      await assert.rejects(command("transfer", { ticket_id: hrTicket.id, expected_revision: hrView.revision, category_id: supportCategory, title: "Forbidden confidential share", body: "Never shared" }, "hr", "tenant"), e => e.code === "42501");
    });
    await t.test("group labels and effective route timezones are safe in list, detail and category options", async () => {
      await db.query("savepoint ticket_projection");
      try {
        const group = (await db.query("select id,name from public.ticket_groups where tenant_id=$1", [tenant])).rows[0];
        const view = await query("detail", { ticket_id: first.id }, "planner", "tenant");
        await command("assign", { ticket_id: first.id, expected_revision: view.revision, group_id: group.id }, "planner", "tenant");
        const supportTimezone = (await db.query("select settings->>'timezone' timezone from private.ticket_config where scope_key='platform'")).rows[0].timezone;
        const tenantTimezone = supportTimezone === "Pacific/Auckland" ? "Europe/London" : "Pacific/Auckland";
        await db.query("update private.ticket_config set settings=jsonb_set(settings,'{timezone}',to_jsonb($2::text)) where tenant_id=$1", [tenant, tenantTimezone]);
        const own = await query("detail", { ticket_id: first.id });
        assert.equal(own.assigned_group_id, group.id); assert.equal(own.assigned_group_name, group.name);
        assert.equal(own.timezone, tenantTimezone);
        assert.equal(JSON.stringify(own).includes("member_ids"), false);
        const listed = (await query("list")).items.find(x => x.id === first.id);
        assert.equal(listed.assigned_group_name, group.name); assert.equal(listed.timezone, own.timezone);
        const options = await query("options", {}, "planner", "tenant");
        assert.equal(options.categories.find(x => x.id === category).group_name, group.name);
        assert.deepEqual(options.groups, []);
        const support = (await db.query("select id from public.tickets where tenant_id=$1 and route='platform_support'", [tenant])).rows[0];
        assert.notEqual(supportTimezone, own.timezone);
        assert.equal((await query("detail", { ticket_id: support.id }, "admin", "support")).timezone, supportTimezone);
        assert.equal((await query("list", {}, "platform", "platform", tenant)).items.find(x => x.id === support.id).timezone, supportTimezone);
      } finally {
        await db.query("rollback to savepoint ticket_projection");
        await db.query("release savepoint ticket_projection");
      }
    });
    await t.test("cancel permission matches own-ticket and close rights, phase, reason and revision", async () => {
      await db.query("savepoint ticket_cancel");
      try {
        const hours = (await db.query("select id from public.ticket_categories where tenant_id=$1 and code='hours'", [tenant])).rows[0].id;
        let own = await command("create", { title: "Fictitious hours cancellation", body: "Fictitious intake", category_id: hours });
        assert.equal(own.permissions.cancel, true);
        const finance = await query("detail", { ticket_id: own.id }, "finance", "tenant");
        assert.equal(finance.permissions.manage, true); assert.equal(finance.permissions.cancel, false);
        await assert.rejects(command("status", { ticket_id: own.id, expected_revision: finance.revision, status: "cancelled", reason: "Fictitious cancellation" }, "finance", "tenant"), e => e.code === "42501");
        await assert.rejects(command("status", { ticket_id: own.id, expected_revision: own.revision, status: "cancelled" }), e => e.code === "42501");
        await assert.rejects(command("status", { ticket_id: own.id, expected_revision: own.revision - 1, status: "cancelled", reason: "Fictitious cancellation" }), e => e.code === "40001");
        own = await command("status", { ticket_id: own.id, expected_revision: own.revision, status: "cancelled", reason: "Fictitious cancellation" });
        assert.equal(own.status, "cancelled"); assert.equal(own.permissions.cancel, false);
        const active = await command("create", { title: "Fictitious handler cancellation", body: "Fictitious intake", category_id: hours });
        let handler = await query("detail", { ticket_id: active.id }, "planner", "tenant");
        assert.equal(handler.permissions.cancel, true);
        handler = await command("status", { ticket_id: active.id, expected_revision: handler.revision, status: "resolved", resolution: "Fictitious solution" }, "planner", "tenant");
        assert.equal(handler.permissions.cancel, false);
        await assert.rejects(command("status", { ticket_id: active.id, expected_revision: handler.revision, status: "cancelled", reason: "Already resolved" }, "planner", "tenant"), e => e.code === "23514");
        handler = await command("status", { ticket_id: active.id, expected_revision: handler.revision, status: "in_progress", reason: "Fictitious reopening" }, "planner", "tenant");
        handler = await command("status", { ticket_id: active.id, expected_revision: handler.revision, status: "cancelled", reason: "Fictitious handler cancellation" }, "planner", "tenant");
        assert.equal(handler.status, "cancelled"); assert.equal(handler.permissions.cancel, false);
      } finally {
        await db.query("rollback to savepoint ticket_cancel");
        await db.query("release savepoint ticket_cancel");
      }
    });
    await t.test("redaction masks text and search without editing the immutable source", async () => {
      await grant("admin", "tickets.redact");
      const view = await query("detail", { ticket_id: first.id }, "admin", "tenant");
      const message = view.messages.find(m => m.body === "Public fixture message");
      await command("redact", { ticket_id: first.id, expected_revision: view.revision, message_id: message.id, reason: "Fictitious privacy correction" }, "admin", "tenant");
      const staffView = await query("detail", { ticket_id: first.id });
      assert.equal(staffView.messages.find(m => m.id === message.id).body, "Bericht afgeschermd");
      assert.equal((await query("list", { search: "Public fixture message" })).total, 0);
      assert.equal((await db.query("select body from public.ticket_messages where id=$1", [message.id])).rows[0].body, "Public fixture message");
      await assert.rejects(call("update public.ticket_messages set body='Rewritten' where id=$1", [message.id], "admin"), e => e.code === "42501");
    });
    await t.test("business-time deadlines cross DST and waiting pauses; staff confirms or reopens", async () => {
      const cfg = { timezone: "Europe/Amsterdam", weekdays: [1, 2, 3, 4, 5], opens: "09:00", closes: "17:00" };
      const due = (await db.query("select private.ticket_business_due('2026-10-23T14:30:00Z',120,$1) due", [cfg])).rows[0].due;
      assert.equal(due.toISOString(), "2026-10-26T09:30:00.000Z");
      let view = await query("detail", { ticket_id: first.id }, "planner", "tenant");
      view = await command("status", { ticket_id: first.id, expected_revision: view.revision, status: "waiting_reporter", next_step: "Please clarify the fictitious issue" }, "planner", "tenant");
      assert.equal(view.resolution_due_at, null);
      assert.equal(view.next_step, "Please clarify the fictitious issue");
      let own = await query("detail", { ticket_id: first.id });
      own = await command("reply", { ticket_id: first.id, expected_revision: own.revision, body: "Fictitious clarification", audience: "reporter" });
      assert.equal(own.status, "in_progress"); assert.ok(own.resolution_due_at);
      view = await query("detail", { ticket_id: first.id }, "planner", "tenant");
      await assert.rejects(command("status", { ticket_id: first.id, expected_revision: view.revision, status: "resolved" }, "planner", "tenant"), e => e.code === "23514");
      await command("status", { ticket_id: first.id, expected_revision: view.revision, status: "resolved", resolution: "Fictitious completed resolution" }, "planner", "tenant");
      own = await query("detail", { ticket_id: first.id });
      own = await command("status", { ticket_id: first.id, expected_revision: own.revision, status: "closed" }); assert.equal(own.status, "closed");
      own = await command("status", { ticket_id: first.id, expected_revision: own.revision, status: "in_progress", reason: "Fictitious recurring problem" }); assert.equal(own.status, "in_progress");
      await assert.rejects(call("select public.process_ticket_deadlines() data"), e => e.code === "42501");
    });
    await t.test("null contexts, raw entitlements and empty scope flags fail closed", async () => {
      await assert.rejects(query("config", {}, "staff", null), e => e.code === "42501");
      await assert.rejects(command("settings_save", { expected_revision: 2, timezone: "Europe/Amsterdam", opening_hours: { days: [1], start: "09:00", end: "10:00" } }, "staff", null), e => e.code === "42501");
      await assert.rejects(call("update public.tenant_settings set enabled_services=array['planning','personeel'] where tenant_id=$1", [tenant], "admin"), e => e.code === "42501");
      const blocked=await call("update public.tenant_memberships set user_id=$1 where tenant_id=$2 and user_id=$3 returning user_id", [users.outsider, tenant, users.admin], "admin");
      assert.deepEqual(blocked, []);
      assert.equal((await db.query("select user_id from public.tenant_memberships where tenant_id=$1 and user_id=$2",[tenant,users.admin])).rows[0].user_id,users.admin);
      const invalid = { user_id: users.support, capability: "tickets.support.read", scope: { all: false, assigned_only: false }, expected_revision: 1, reason: "Do not interpret empty flags as unrestricted" };
      const verification = await verify("grant_save", invalid);
      await assert.rejects(command("grant_save", { ...invalid, verification_id: verification }, "admin", "tenant"), e => e.code === "23514");
    });
    await t.test("critical priority, all list views, exact counters, modules and date-times agree with UI", async () => {
      const created = await command("create", { title: "Zulu " + "x".repeat(170), body: "Fictitious urgency request", category_id: category, urgency: "urgent", module: "account", needed_before: "2026-10-01T15:30:00+02:00" });
      assert.equal(created.priority, "high"); assert.equal(created.module, "account"); assert.equal(new Date(created.needed_before).toISOString(), "2026-10-01T13:30:00.000Z");
      await assert.rejects(command("create", { title: "Forged critical issue", body: "Do not permit staff priority escalation", category_id: category, priority: "critical" }), e => e.code === "23514");
      await assert.rejects(command("create", { title: "Secret technical context", body: "Do not import arbitrary metadata", category_id: category, technical_context: { password: "SECRET-CANARY" } }), e => e.code === "23514");
      let managed = await query("detail", { ticket_id: created.id }, "planner", "tenant");
      await assert.rejects(command("priority", { ticket_id: created.id, expected_revision: managed.revision, priority: "critical", reason: "Cannot self-assert critical right" }, "planner", "tenant"), e => e.code === "42501");
      await grant("planner", "tickets.internal.critical");
      managed = await command("priority", { ticket_id: created.id, expected_revision: managed.revision, priority: "critical", reason: "Fictitious business impact assessment" }, "planner", "tenant");
      assert.equal(managed.permissions.critical, true);
      await db.query("update public.tickets set first_response_due_at=now()-interval '1 hour' where id=$1", [created.id]);
      const critical = await query("list", { view: "critical", page_size: 1 }, "planner", "tenant"); assert.equal(critical.total, 1); assert.equal(critical.items[0].id, created.id);
      const overdue = await query("list", { view: "overdue" }, "planner", "tenant"); assert.ok(overdue.items.some(x => x.id === created.id));
      const needs = await query("list", { view: "needs_reply", page_size: 1 }, "planner", "tenant"); assert.ok(needs.total > 1); assert.equal(needs.counts.needs_reply, needs.total);
      const asc = await query("list", { sort: "subject", direction: "asc" }, "planner", "tenant");
      const desc = await query("list", { sort: "subject", direction: "desc" }, "planner", "tenant");
      assert.deepEqual(asc.items.map(x => x.title), [...desc.items.map(x => x.title)].reverse());
      assert.ok(asc.categories.some(x => x.id === category)); assert.equal(asc.categories.some(x => x.id === hrCategory), false);
      const options = await query("options"); assert.ok(options.modules.includes("account")); assert.ok(options.modules.includes("overig"));
      for (const sort of ["attention", "activity", "created", "number", "subject", "priority", "status", "deadline"]) assert.ok((await query("list", { sort, direction: "asc" })).items.length > 0);
      const processed = await call("select public.process_ticket_deadlines($1) data", [tenant], "admin", "service_role"); assert.ok(processed.processed >= 1);
      assert.equal((await call("select public.process_ticket_deadlines($1) data", [tenant], "admin", "service_role")).processed, 0);
      managed = await query("detail", { ticket_id: created.id }, "planner", "tenant");
      await command("status", { ticket_id: created.id, expected_revision: managed.revision, status: "resolved", resolution: "Fictitious solution before the close job" }, "planner", "tenant");
      await db.query("update public.ticket_categories set auto_close_days=1 where id=$1", [category]);
      await db.query("update public.tickets set resolved_at=now()-interval '2 days' where id=$1", [created.id]);
      assert.equal((await call("select public.process_ticket_deadlines($1) data", [tenant], "admin", "service_role")).processed, 1);
      assert.equal((await query("detail", { ticket_id: created.id })).status, "closed");
      const closed = await query("detail", { ticket_id: created.id }, "planner", "tenant");
      for (const action of ["reply", "note", "manage", "assign", "priority", "transfer", "share"]) assert.equal(closed.permissions[action], false);
      assert.equal(closed.permissions.reopen, true); assert.equal(closed.permissions.archive, true);
      assert.equal(closed.resolution, "Fictitious solution before the close job");
      for (const [kind, extra] of [["assign", { assigned_user_id: users.planner }], ["priority", { priority: "normal", reason: "Already closed" }], ["category", { category_id: category, reason: "Already closed" }]]) await assert.rejects(command(kind, { ticket_id: created.id, expected_revision: closed.revision, ...extra }, "planner", "tenant"), e => e.code === "23514");
    });
    await t.test("deadline batches skip old non-due records and advance without duplicate events", async () => {
      await db.query("savepoint deadline_backlog");
      try {
        const queueTenant = randomUUID();
        await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious deadline backlog')", [queueTenant, `tickets-backlog-${queueTenant}`]);
        await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets'])", [queueTenant]);
        const queueCategory = (await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'", [queueTenant])).rows[0].id;
        await db.query("insert into public.tickets(tenant_id,number,route,category_id,reporter_user_id,reporter_name,title,created_at,first_response_due_at,resolution_due_at) select $1,'FUTURE-'||n,'internal',$2,$3,'Fictitious reporter','Fictitious future deadline',now()-interval '2 months',now()+interval '1 year',now()+interval '1 year' from generate_series(1,101)n", [queueTenant, queueCategory, users.staff]);
        await db.query("insert into public.tickets(tenant_id,number,route,category_id,reporter_user_id,reporter_name,title,created_at,first_response_due_at,resolution_due_at) select $1,'DUE-'||n,'internal',$2,$3,'Fictitious reporter','Fictitious due deadline',now()-interval '10 days',now()-interval '1 day',now()+interval '1 day' from generate_series(1,105)n", [queueTenant, queueCategory, users.staff]);
        const runBatch = () => call("select public.process_ticket_deadlines($1) data", [queueTenant], "admin", "service_role");
        assert.equal((await runBatch()).processed, 100);
        assert.equal((await runBatch()).processed, 5);
        assert.equal((await runBatch()).processed, 0);
        assert.equal((await db.query("select count(*)::integer n from public.tickets where tenant_id=$1 and number like 'FUTURE-%' and revision=1", [queueTenant])).rows[0].n, 101);
        const events = (await db.query("select count(*)::integer n,count(distinct ticket_id)::integer tickets from public.ticket_events where tenant_id=$1 and type='deadline_exceeded'", [queueTenant])).rows[0];
        assert.deepEqual(events, { n: 105, tickets: 105 });
        assert.equal((await db.query("select count(*)::integer n from public.outbox_events where tenant_id=$1 and event_type='ticket.changed'", [queueTenant])).rows[0].n, 105);
        await db.query("update public.ticket_categories set auto_close_days=1 where id=$1", [queueCategory]);
        const closeId = (await db.query("insert into public.tickets(tenant_id,number,route,category_id,reporter_user_id,reporter_name,title,status,resolved_at) values($1,'CLOSE-DUE','internal',$2,$3,'Fictitious reporter','Fictitious resolved deadline','resolved',now()-interval '2 days') returning id", [queueTenant, queueCategory, users.staff])).rows[0].id;
        assert.equal((await runBatch()).processed, 1);
        assert.equal((await runBatch()).processed, 0);
        assert.equal((await db.query("select status from public.tickets where id=$1", [closeId])).rows[0].status, "closed");
        assert.equal((await db.query("select count(*)::integer n from public.ticket_events where ticket_id=$1 and type='auto_closed'", [closeId])).rows[0].n, 1);
      } finally {
        await db.query("rollback to savepoint deadline_backlog");
        await db.query("release savepoint deadline_backlog");
      }
    });
    await t.test("metadata-only fixture cascades preserve real ticket history and private mutation audit", async () => {
      await call("delete from public.tenants where id=$1", [otherTenant], "admin", "postgres");
      assert.equal((await db.query("select count(*)::integer n from public.permission_grants where tenant_id=$1", [otherTenant])).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::integer n from private.ticket_config where tenant_id=$1", [otherTenant])).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::integer n from private.ticket_permission_bootstrap where tenant_id=$1", [otherTenant])).rows[0].n, 0);
      await assert.rejects(call("delete from public.tenants where id=$1", [tenant], "admin", "postgres"), e => e.code === "23503");
      await assert.rejects(call("delete from public.ticket_categories where id=$1", [category], "admin", "postgres"), e => e.code === "23503");
      const audit = (await db.query("select action,detail from private.ticket_audit where tenant_id=$1 and action='ticket.priority'", [tenant])).rows;
      assert.ok(audit.length > 0); assert.ok(audit[0].detail.before.revision); assert.ok(audit[0].detail.after.revision > audit[0].detail.before.revision);
      assert.equal(JSON.stringify(audit).includes("Fictitious business impact assessment"), false);
      const config = await query("config", {}, "admin", "tenant");
      assert.equal(config.audit.some(a => a.action.startsWith("ticket.")), false);
    });
    await t.test("configuration-only audit excludes confidential ticket activity metadata", async () => {
      await grant("coworker", "tickets.config");
      const configAccess = await query("access", {}, "coworker", "tenant");
      assert.equal(configAccess.allowed, false); assert.equal(configAccess.can_configure, true);
      assert.equal(configAccess.can_delegate, false);
      assert.deepEqual((await query("config", {}, "coworker", "tenant")).audit, []);
      await grant("coworker", "tickets.permissions");
      await assert.rejects(query("detail", { ticket_id: hrTicket.id }, "coworker", "tenant"), e => e.code === "42501");
      await assert.rejects(call("select * from private.ticket_audit", [], "coworker"), e => e.code === "42501");
      const before = await query("config", {}, "coworker", "tenant");
      const configActions = new Set(["grant_save", "grant_revoke", "category_save", "group_save", "settings_save"]);
      assert.ok(before.audit.some(a => a.action === "settings_save" && a.actor_name && a.created_at));
      assert.ok(before.audit.every(a => configActions.has(a.action)));
      const hr = await query("detail", { ticket_id: hrTicket.id }, "hr", "tenant");
      await command("priority", { ticket_id: hrTicket.id, expected_revision: hr.revision, priority: "high", reason: "Fictitious confidential triage" }, "hr", "tenant");
      const hiddenAudit = (await db.query("select id from private.ticket_audit where tenant_id=$1 and target_id=$2 and actor_id=$3 and action='ticket.priority'", [tenant, hrTicket.id, users.hr])).rows;
      assert.equal(hiddenAudit.length, 1);
      const after = await query("config", {}, "coworker", "tenant");
      assert.deepEqual(after.audit, before.audit);
      assert.equal(JSON.stringify(after.audit).includes(hrTicket.id), false);
      assert.equal(JSON.stringify(after.audit).includes(hiddenAudit[0].id), false);
    });
    await t.test("delegation without content rights enforces grant and revoke CAS after verification", async () => {
      await grant("coworker", "tickets.permissions");
      const access = await query("access", {}, "coworker", "tenant");
      assert.equal(access.allowed, false); assert.equal(access.can_delegate, true);
      const current = (await db.query("select id,revision from public.permission_grants where tenant_id=$1 and user_id=$2 and capability='tickets.support.read'", [tenant, users.support])).rows[0];
      const stale = { user_id: users.support, capability: "tickets.support.read", scope: { all: true }, expected_revision: 0, reason: "Fictitious stale grant revision" };
      const staleVerification = await verify("grant_save", stale, "coworker");
      await assert.rejects(command("grant_save", { ...stale, verification_id: staleVerification }, "coworker", "tenant"), e => e.code === "40001");
      const revoke = { grant_id: current.id, expected_revision: current.revision, reason: "Fictitious scoped permission revocation" };
      const verifiedBeforeChange = await verify("grant_revoke", revoke, "coworker");
      await db.query("update public.permission_grants set revision=revision+1 where id=$1", [current.id]);
      await assert.rejects(command("grant_revoke", { ...revoke, verification_id: verifiedBeforeChange }, "coworker", "tenant"), e => e.code === "40001");
      const fresh = { ...revoke, expected_revision: current.revision + 1 };
      const freshVerification = await verify("grant_revoke", fresh, "coworker");
      await command("grant_revoke", { ...fresh, verification_id: freshVerification }, "coworker", "tenant");
      assert.equal((await query("access", {}, "support", "support")).allowed, false);
    });
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
