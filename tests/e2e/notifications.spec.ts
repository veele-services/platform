import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { E2E_APP_ORIGIN } from "./staff-auth";
import { authenticateWorkspace } from "./login-auth";

// OTPs must not be retained in traces, automatic screenshots or videos.
test.use({ trace: "off", screenshot: "off", video: "off" });
const fixture = randomUUID(), tenantId = randomUUID(), objectId = randomUUID(), customerId = randomUUID(), contactId = randomUUID();
const slug = `notifications-e2e-${fixture.slice(0, 8)}`, tenantName = `Notificaties ${fixture.slice(0, 8)}`, password = "Fieldgrid-E2E-2026";
const users: Record<string, { id: string; email: string; personnelId?: string }> = {};
type DbClient = ReturnType<typeof createClient<Database>>;
let db: pg.Client, admin: DbClient;
let platformInboxId = "", customerInboxId = "", managerInboxId = "";

async function authClient(role: string) { const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }); const login = await client.auth.signInWithPassword({ email: users[role].email, password }); if (login.error) throw new Error("Notification fixture login failed"); return client; }
async function rpc(client: DbClient, name: string, args: Record<string, unknown>) { const invoke = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string } | null }>; const result = await invoke(name, args); if (result.error) throw new Error(`Notification fixture RPC ${name} failed (${result.error.code})`); return result.data as { id: string; revision: number; counts: { total: number }; selection_token: string }; }
async function prepareFixtureInApp() {
  const requests = (await db.query("select id from private.notification_requests where tenant_id=$1 and prepared_at is null", [tenantId])).rows;
  for (const r of requests) await rpc(admin, "notification_delivery_prepare", { request_id: r.id });
  // Bounded fixture-only lease acquisition: never run the global provider queue.
  const claims = (await db.query("update private.notification_deliveries set state='claimed',lease=gen_random_uuid(),locked_until=now()+interval '10 minutes',attempts=attempts+1,revision=revision+1 where tenant_id=$1 and channel='in_app' and state='queued' and available_at<=now() returning id,lease", [tenantId])).rows;
  for (const d of claims) await rpc(admin, "notification_delivery_begin", { delivery_id: d.id, lease_id: d.lease });
}
async function seedCampaign(role: string, workspace: string, criteria: Record<string, unknown>, title: string) {
  const client = await authClient(role), target = workspace === "platform" ? null : tenantId;
  try {
    const c = await rpc(client, "notification_command", { target_tenant: target, actor_context: workspace, command: "campaign_save", payload: { expected_revision: 0, title, body: `Fictieve privétekst ${title}`, priority: "normal", criteria, channels: ["in_app"], timezone: "Europe/Amsterdam", ack_required: false, action_label: "" }, request_id: randomUUID() });
    const preview = await rpc(client, "notification_query", { target_tenant: target, actor_context: workspace, operation: "recipients", payload: { criteria } });
    expect(preview.counts.total).toBeGreaterThan(0);
    await rpc(client, "notification_command", { target_tenant: target, actor_context: workspace, command: "campaign_publish", payload: { id: c.id, expected_revision: c.revision, selection_token: preview.selection_token }, request_id: randomUUID() });
  } finally { await client.auth.signOut(); }
}
test.beforeAll(async () => {
  const target = requireLocalDatabaseUrl(); requireLocalApiUrl();
  db = new pg.Client({ connectionString: target.href }); await db.connect();
  admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  for (const role of ["manager", "worker", "colleague", "customer", "platform"]) { const email = `${role}-${fixture}@notification-browser.test`, result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Fictief ${role}` } }); if (result.error) throw new Error("Notification browser fixture user failed"); users[role] = { id: result.data.user.id, email }; }
  await db.query("insert into public.tenants(id,name,slug) values($1,$2,$3)", [tenantId, tenantName, slug]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','finance','tickets'])", [tenantId]);
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color) values($1,'#214E72','#C65D21')", [tenantId]);
  for (const role of ["manager", "worker", "colleague"]) {
    const m = (await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at) values($1,$2,array[$3]::public.app_role[],'active',now()) returning id", [tenantId, users[role].id, role === "manager" ? "tenant_admin" : "staff"])).rows[0].id;
    await db.query("select private.notification_seed_membership($1)", [m]);
    if (role === "manager") for (const cap of ["notifications.permissions", "tickets.support.read", "tickets.support.create"]) await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,$4,'{\"all\":true}') on conflict do nothing", [tenantId, users[role].id, m, cap]);
    else { users[role].personnelId = randomUUID(); await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,employee_number,status) values($1,$2,$3,$4,$5,'active')", [users[role].personnelId, tenantId, users[role].id, role === "worker" ? "Robin Notificatietest" : "Andere Notificatietest", role === "worker" ? "N-001" : "N-002"]); }
  }
  await db.query("insert into public.platform_admins(user_id) values($1)", [users.platform.id]);
  for (const cap of ["platform.notifications.read", "platform.notifications.send", "platform.notifications.manage_tenant", "platform.notifications.delivery.read", "platform.notifications.templates.manage", "platform.support.read"]) await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,$2,$3) on conflict do nothing", [users.platform.id, cap, cap.includes("templates") ? { all: true } : { tenant_ids: [tenantId] }]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'NOTIFY-CUSTOMER','Fictieve notificatieklant')", [customerId, tenantId]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'NOTIFY-OBJECT','Fictieve notificatielocatie','{}')", [objectId, tenantId, customerId]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'Klant Notificatietest',$4)", [contactId, tenantId, customerId, users.customer.email]);
  await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)", [tenantId, objectId, users.customer.id, users.manager.id]);
  await seedCampaign("manager", "backoffice", { kind: "customer", contact_ids: [contactId] }, "Klantbericht alleen voor klant");
  await seedCampaign("platform", "platform", { kind: "management", tenant_ids: [tenantId] }, "Fieldgrid bericht aan management");
  const manager = await authClient("manager");
  try {
    const category = (await db.query("select id from public.ticket_categories where tenant_id is null and code='technical'")).rows[0].id;
    const ticket = await rpc(manager, "ticket_command", { target_tenant: tenantId, actor_context: "support", command: "create", payload: { title: "Fictieve supportmelding notificaties", body: "Fictieve inhoud blijft buiten algemene platformnotificaties.", category_id: category, urgency: "normal", technical_context: { environment: "local", release: "local" } }, request_id: randomUUID() });
    const events = (await db.query("select id from public.outbox_events where tenant_id=$1 and event_type='ticket.changed' and aggregate_id=$2", [tenantId, ticket.id])).rows; expect(events.length).toBeGreaterThan(0);
    for (const e of events) await rpc(admin, "notification_outbox_prepare", { target_event: e.id });
  } finally { await manager.auth.signOut(); }
  await prepareFixtureInApp();
  const notices = (await db.query("select id,user_id,context from public.notifications where user_id=any($1::uuid[])", [Object.values(users).map(u => u.id)])).rows;
  customerInboxId = notices.find(n => n.user_id === users.customer.id && n.context === "customer")?.id; managerInboxId = notices.find(n => n.user_id === users.manager.id && n.context === "backoffice")?.id; platformInboxId = notices.find(n => n.user_id === users.platform.id && n.context === "platform")?.id;
  expect(customerInboxId).toBeTruthy(); expect(managerInboxId).toBeTruthy(); expect(platformInboxId).toBeTruthy();
});
test.afterAll(async () => {
  if (!db) return;
  try {
    requireLocalDatabaseUrl();
    const found = (await db.query("select slug from public.tenants where id=$1", [tenantId])).rows[0];
    if (found) {
      expect(found.slug).toBe(slug); const ids = Object.values(users).map(u => u.id);
      const tables = (await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private') and table_name in(select tablename from pg_tables where schemaname in ('public','private'))")).rows;
      await db.query("begin");
      try {
        await db.query("set local session_replication_role='replica'");
        await db.query("delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)", [tenantId]);
        for (const row of tables) { expect(row.table_schema).toMatch(/^(public|private)$/); expect(row.table_name).toMatch(/^[a-z_]+$/); await db.query(`delete from "${row.table_schema}"."${row.table_name}" where tenant_id=$1`, [tenantId]); }
        for (const table of ["notification_receipts", "notification_audit", "notification_verifications", "ticket_receipts", "ticket_audit", "ticket_verifications"]) await db.query(`delete from private.${table} where actor_id=any($1::uuid[])`, [ids]);
        await db.query("delete from private.notification_campaigns where sender_id=any($1::uuid[])", [ids]);
        await db.query("delete from public.notifications where user_id=any($1::uuid[])", [ids]);
        await db.query("delete from public.permission_grants where user_id=any($1::uuid[])", [ids]);
        await db.query("delete from public.platform_admins where user_id=any($1::uuid[])", [ids]);
        await db.query("delete from private.notification_delegation_bootstrap where subject_id=any($1::uuid[])", [ids]);
        await db.query("delete from public.tenants where id=$1", [tenantId]); await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
    }
    for (const u of Object.values(users)) { const r = await admin.auth.admin.deleteUser(u.id); if (r.error) throw new Error("Notification fixture cleanup failed"); }
  } finally { await db.end(); }
});
async function login(page: Page, role: string, path: string) { page.setDefaultTimeout(20000); await authenticateWorkspace(page, users[role].email, path, password); await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, "\\?"))); }
async function visual(page: Page, name: string, ready: () => Promise<void>) { for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 960 }); await ready(); await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); }); await expect.poll(() => page.evaluate(() => { const dialog = document.querySelector("[role=dialog]")?.getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && (!dialog || dialog.left >= 0 && dialog.right <= innerWidth && dialog.width <= innerWidth); })).toBe(true); await page.screenshot({ path: `test-results/notifications-${name}-${width}.png`, fullPage: true }); } }

test("notificatiewizard publiceert exacte selectie; personeel leest, bevestigt en archiveert los van bronstatus", async ({ page, browser }) => {
  test.setTimeout(180000); const title = `Fictieve teammelding ${fixture.slice(0, 8)}`;
  await login(page, "manager", "/app/notificaties"); await expect(page.getByRole("heading", { name: "Notificaties", exact: true })).toBeVisible();
  await expect(page.locator(`.nt-inbox-item[href$='/${managerInboxId}']`)).toBeVisible();
  await page.locator(`.nt-inbox-item[href$='/${managerInboxId}']`).click();
  const detail=page.locator(".nt-detail-dialog");
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:960});
    const controls=[detail.getByRole("button",{name:"Gelezen markeren",exact:true}),detail.getByRole("button",{name:"Archiveren",exact:true}),detail.getByRole("button",{name:"Notificatie vernieuwen",exact:true})];
    for(const control of controls){await expect(control).toBeVisible();await expect(control).toHaveText("");}
    const bounds=await Promise.all(controls.map(control=>control.boundingBox()));
    expect(Math.max(...bounds.map(bound=>bound!.y))-Math.min(...bounds.map(bound=>bound!.y))).toBeLessThan(2);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/notification-detail-icons-${width}.png`});
  }
  await detail.getByRole("button",{name:"Sluiten",exact:true}).click();
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole("button", { name: "Nieuwe notificatie", exact: true }).click(); const form = page.getByRole("dialog", { name: "Nieuwe notificatie", exact: true });
  await form.getByLabel("Robin Notificatietest", { exact: true }).check(); await expect(form.getByText("1 ontvangers", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Volgende", exact: true }).click(); await form.getByLabel("Onderwerp", { exact: true }).fill(title); await form.getByLabel("Bericht", { exact: true }).fill("Fictieve privétekst uitsluitend voor Robin. Ontvangstbevestiging is geen zakelijk akkoord."); await form.getByLabel("Ontvangstbevestiging vragen").check();
  await form.getByRole("button", { name: "Volgende", exact: true }).click(); await expect(form.getByLabel("In-app", { exact: true })).toBeChecked();
  await form.getByRole("button", { name: "Volgende", exact: true }).click(); await expect(form.getByRole("button", { name: "Verstuur naar 1 bereikbare ontvangers", exact: true })).toBeVisible();
  await visual(page, "wizard-review", async () => { await expect(form.getByRole("heading", { name: title, exact: true }).first()).toBeVisible(); await expect(form.getByRole("button", { name: "Verstuur naar 1 bereikbare ontvangers", exact: true })).toBeEnabled(); });
  expect((await db.query("select count(*)::int n from public.notifications where tenant_id=$1 and title=$2", [tenantId, title])).rows[0].n).toBe(0);
  await form.getByRole("button", { name: "Verstuur naar 1 bereikbare ontvangers", exact: true }).click(); await expect(form).toHaveCount(0); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const campaignId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect((await db.query("select user_id from private.notification_campaign_recipients where campaign_id=$1", [campaignId])).rows.map(r => r.user_id)).toEqual([users.worker.id]);
  await prepareFixtureInApp(); const notice = (await db.query("select id from public.notifications where tenant_id=$1 and campaign_id=$2 and user_id=$3", [tenantId, campaignId, users.worker.id])).rows[0].id;
  const staffContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN }), otherContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN });
  try {
    const staff = await staffContext.newPage(); await login(staff, "worker", "/staff/notificaties");
    await visual(staff, "staff-inbox", async () => { await expect(staff.getByRole("heading", { name: "Mijn notificaties", exact: true })).toBeVisible(); await expect(staff.locator(`.nt-inbox-item[href$='/${notice}']`)).toContainText(title); await expect(staff.locator(".nt-page")).toHaveAttribute("aria-busy", "false"); });
    await staff.locator(`.nt-inbox-item[href$='/${notice}']`).click(); await staff.getByRole("button", { name: "Gelezen markeren", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Ongelezen markeren", exact: true })).toBeVisible(); expect((await db.query("select acknowledged_at from public.notifications where id=$1", [notice])).rows[0].acknowledged_at).toBeNull();
    await staff.getByRole("button", { name: "Ontvangst bevestigen", exact: true }).click(); await expect(staff.getByRole("button", { name: "Ontvangst bevestigen", exact: true })).toHaveCount(0);
    await staff.getByRole("button", { name: "Archiveren", exact: true }).click(); await expect(staff.getByRole("button", { name: "Terug naar inbox", exact: true })).toBeVisible();
    await staff.goto("/staff/notificaties?view=archived"); await expect(staff.locator(`.nt-inbox-item[href$='/${notice}']`)).toBeVisible();
    const colleague = await otherContext.newPage(); await login(colleague, "colleague", "/staff/notificaties"); await expect(colleague.getByText(title)).toHaveCount(0); const denied = await colleague.goto(`/staff/notificaties/${notice}`); expect(await denied!.text()).not.toContain(title); await expect(colleague.getByRole("heading", { name: "Deze pagina bestaat niet.", exact: true })).toBeVisible();
    await staff.goto("/staff/notificaties"); await expect(staff.getByRole("button", { name: /Notificaties, / })).toBeVisible(); await staff.evaluate(() => { window.dispatchEvent(new Event("notifications-account-cleared")); window.dispatchEvent(new Event("focus")); }); await expect(staff.getByRole("button", { name: /Notificaties, / })).toHaveCount(0);
  } finally { await staffContext.close(); await otherContext.close(); }
});

test("klant- en platforminbox tonen uitsluitend eigen context, met blijvende centrale voorkeuren", async ({ page, browser }) => {
  test.setTimeout(120000);
  await db.query("insert into private.notification_preferences(tenant_id,user_id,context,quiet_start,quiet_end) values($1,$2,'customer','21:30','08:30') on conflict do nothing",[tenantId,users.customer.id]);
  await authenticateWorkspace(page,users.customer.email,"/klant/notificaties",password);
  await expect(page).toHaveURL(/\/klant\?view=notifications$/);
  await visual(page, "customer-inbox", async () => { await expect(page.getByRole("heading", { name: "Meldingen", exact: true })).toBeVisible(); await expect(page.locator(".notice-row").filter({has:page.getByRole("heading",{name:"Klantbericht alleen voor klant",exact:true})})).toBeVisible(); });
  await expect(page.getByRole("button", { name: "Nieuwe notificatie" })).toHaveCount(0);
  await expect(page.getByText("Fieldgrid bericht aan management",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Alles gelezen",exact:true}).click();
  await expect.poll(async()=>(await db.query("select read_at is not null as read from public.notifications where id=$1",[customerInboxId])).rows[0].read).toBe(true);
  const preferences=async()=>{await page.getByRole("button",{name:"Profielmenu openen",exact:true}).click();await page.getByRole("menuitem",{name:"Notificaties",exact:true}).click();return page.getByRole("dialog",{name:"Mijn e-mailvoorkeuren",exact:true});};
  const form=await preferences();await expect(form.getByRole("checkbox")).toHaveCount(5);
  await form.getByLabel("E-mail nieuws & dienstverlening",{exact:true}).uncheck();await form.getByRole("button",{name:"Voorkeuren opslaan",exact:true}).click();await expect(form.getByRole("status")).toContainText("Je voorkeuren zijn opgeslagen");
  await page.reload();const restored=await preferences();await expect(restored.getByLabel("E-mail nieuws & dienstverlening",{exact:true})).not.toBeChecked();await expect(restored.getByLabel("E-mail afspraken & planning",{exact:true})).toBeChecked();
  const central=(await db.query("select quiet_start::text,quiet_end::text from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='customer' and type_code is null",[tenantId,users.customer.id])).rows[0];
  expect(central).toEqual({quiet_start:"21:30:00",quiet_end:"08:30:00"});
  expect((await db.query("select email from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='customer' and type_code='manual.tenant'",[tenantId,users.customer.id])).rows[0].email).toBe(false);
  const platformContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN });
  try { const platform = await platformContext.newPage(); await login(platform, "platform", "/platform/notificaties"); await visual(platform, "platform-inbox", async () => { await expect(platform.getByRole("heading", { name: "Notificatiebeheer", exact: true })).toBeVisible(); await expect(platform.locator(`.nt-inbox-item[href$='/${platformInboxId}']`)).toBeVisible(); }); await expect(platform.getByText("Klantbericht alleen voor klant")).toHaveCount(0); const denied = await platform.goto(`/platform/notificaties/${customerInboxId}`); expect(await denied!.text()).not.toContain("Klantbericht alleen voor klant"); await expect(platform.getByRole("heading", { name: "Deze pagina bestaat niet.", exact: true })).toBeVisible(); }
  finally { await platformContext.close(); }
});

test("beleid, tenanttemplate en expliciete notificatiebevoegdheid gebruiken echte versiecontrole en OTP", async ({ page, request }) => {
  test.setTimeout(180000); await login(page, "manager", "/app/notificaties"); await page.getByRole("link", { name: "Automatische meldingen", exact: true }).click(); await expect(page.getByRole("heading", { name: "Automatische meldingen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Instelling toevoegen", exact: true }).click(); const policy = page.getByRole("dialog", { name: "Notificatiebeleid aanpassen", exact: true }); await expect(policy).toBeVisible(); await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); }); await page.screenshot({ path: "test-results/notifications-policy-open.png" }); await policy.getByLabel("Notificatietype", { exact: true }).selectOption("manual.tenant"); await policy.getByLabel("Kanaal", { exact: true }).selectOption("push"); await policy.getByLabel("Instelling", { exact: true }).selectOption("off"); await policy.getByLabel("Reden", { exact: true }).fill("Fictieve browsercontrole voor expliciete pushblokkade."); page.once("dialog", d => d.accept()); await policy.getByRole("button", { name: "Beleid opslaan", exact: true }).click(); await expect(policy.getByRole("status")).toContainText("Uitschakeling bevestigd"); page.once("dialog", d => d.accept()); await policy.getByRole("button", { name: "Sluiten", exact: true }).click(); await expect(policy).toHaveCount(0);
  await page.getByRole("button", { name: "Instelling toevoegen", exact: true }).click();
  await policy.getByLabel("Notificatietype", { exact: true }).selectOption("work_order.rescheduled");
  const bundle = policy.getByRole("spinbutton", { name: /^Planningswijzigingen bundelen/ });
  await expect(bundle).toHaveValue(""); await bundle.fill("45");
  await policy.getByLabel("Reden", { exact: true }).fill("Fictieve browsercontrole voor 45 seconden bundeling.");
  await policy.getByRole("button", { name: "Beleid opslaan", exact: true }).click();
  await expect(policy.getByRole("status")).toContainText("Beleid opgeslagen");
  expect((await db.query("select settings->'bundle_seconds' as seconds from private.notification_policies where tenant_id=$1 and scope='tenant' and type_code='work_order.rescheduled' and channel is null and context is null", [tenantId])).rows[0].seconds).toBe(45);
  page.once("dialog", d => d.accept()); await policy.getByRole("button", { name: "Sluiten", exact: true }).click(); await expect(policy).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Overnemen Bundelen: 45 seconden", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Templates", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Templates" })).toBeVisible();
  const targetTemplate = (await db.query("select id from private.notification_templates where tenant_id is null and type_code='manual.tenant' and context='staff' and channel='in_app'")).rows[0].id;
  // Select using the visible catalog label and exact context/channel, not raw IDs.
  const templateName = (await db.query("select name from public.notification_catalog where code='manual.tenant'")).rows[0].name;
  const selectedTemplate = page.getByRole("navigation", { name: "Templates" }).getByRole("button").filter({ hasText: templateName }).filter({ hasText: "Personeelsapp · In-app" });
  await selectedTemplate.click(); await expect(selectedTemplate).toHaveAttribute("aria-pressed", "true");
  const body = page.getByLabel("Berichttekst", { exact: true }); await expect(body).toBeEditable(); const original = await body.inputValue(); await body.fill(`${original}\nFictieve tenanttoevoeging ${fixture.slice(0, 8)}`); await page.getByRole("button", { name: "Versie publiceren", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Nieuwe templateversie gepubliceerd" })).toBeVisible();
  const override = (await db.query("select t.id,t.active_version_id,v.definition->>'body' as body from private.notification_templates t join private.notification_template_versions v on v.id=t.active_version_id where t.tenant_id=$1 and type_code='manual.tenant' and context='staff' and channel='in_app'", [tenantId])).rows[0]; expect(override.id).not.toBe(targetTemplate); expect(override.active_version_id).toBeTruthy(); expect(override.body).toBe(`${original}\nFictieve tenanttoevoeging ${fixture.slice(0, 8)}`); await expect(body).toHaveValue(`${original}\nFictieve tenanttoevoeging ${fixture.slice(0, 8)}`);
  await page.getByText("Vergelijk met de standaard", { exact: true }).click(); await expect(page.getByRole("heading", { name: "Actuele standaard", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Bevoegdheden", exact: true }).click(); await page.getByRole("button", { name: "Notificatierecht toekennen", exact: true }).click(); const grant = page.getByRole("dialog", { name: "Notificatierecht toekennen", exact: true }); await grant.getByLabel("Actieve gebruiker", { exact: true }).selectOption(users.colleague.id); await grant.getByLabel("Notificatierecht", { exact: true }).selectOption("notifications.send_staff"); await grant.getByLabel("Gehele organisatie / platformscope", { exact: true }).uncheck(); await grant.getByLabel("Robin Notificatietest", { exact: true }).check(); await grant.getByLabel("Reden", { exact: true }).fill("Fictief verzendrecht voor uitsluitend één medewerker."); await grant.getByRole("button", { name: "Controleer wijziging" }).click(); await grant.getByRole("button", { name: "Verificatiecode aanvragen" }).click(); await expect(grant.getByLabel("Verificatiecode", { exact: true })).toBeVisible();
  let code = ""; await expect.poll(async () => { const mails = await (await request.get(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(users.manager.email)}`)).json() as Array<{ subject: string; content: Array<{ type: string; value: string }> }>; const mail = mails.filter(m => m.subject === "Bevestig de wijziging van notificatierechten").at(-1); code = mail?.content.find(c => c.type === "text/plain")?.value.match(/\b\d{6}\b/)?.[0] ?? ""; return code.length; }).toBe(6);
  await grant.getByLabel("Verificatiecode", { exact: true }).fill(code); await grant.getByRole("button", { name: "Verifiëren en toekennen" }).click(); await expect(grant).toHaveCount(0); const row = (await db.query("select scope from public.permission_grants where tenant_id=$1 and user_id=$2 and capability='notifications.send_staff'", [tenantId, users.colleague.id])).rows[0]; expect(row.scope.personnel_ids).toEqual([users.worker.personnelId]); expect(row.scope.all).toBe(false);
});

test("gekozen kanalen blokkeren nulbereik en bevestigen uitsluitend het actuele gedeeltelijke bereik", async ({ page }) => {
  test.setTimeout(120000);
  await login(page, "manager", "/app/notificaties");
  await page.getByRole("button", { name: "Nieuwe notificatie", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuwe notificatie", exact: true });
  await dialog.getByLabel("Robin Notificatietest", { exact: true }).check();
  await expect(dialog.getByText("1 ontvangers", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
  const privateBody = "Fictieve inhoud voor de beveiligde inbox, niet voor het vergrendelscherm.";
  const title = `Niet bereikbaar ${fixture.slice(0, 8)}`;
  await dialog.getByLabel("Onderwerp", { exact: true }).fill(title);
  await dialog.getByLabel("Bericht", { exact: true }).fill(privateBody);
  await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
  await dialog.getByLabel("In-app", { exact: true }).uncheck();
  await dialog.getByLabel("Push", { exact: true }).check();
  await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Geen ontvanger is bereikbaar via de gekozen kanalen");
  await expect(dialog.getByRole("button", { name: "Verstuur naar 0 bereikbare ontvangers", exact: true })).toBeDisabled();
  await expect(dialog.getByText("0 bereikbaar via gekozen kanalen", { exact: true })).toBeVisible();
  const pushPreview = dialog.locator(".nt-preview").filter({ has: page.locator("small", { hasText: /^Push ·/ }) });
  await expect(pushPreview).toHaveCount(1); await expect(pushPreview).not.toContainText(privateBody);
  const draft = (await db.query("select id,state from private.notification_campaigns where tenant_id=$1 and title=$2", [tenantId, title])).rows[0];
  expect(draft.state).toBe("draft");
  expect((await db.query("select count(*)::int n from private.notification_campaign_recipients where campaign_id=$1", [draft.id])).rows[0].n).toBe(0);
  await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await db.query("insert into private.notification_preferences(tenant_id,user_id,context,email) values($1,$2,'staff',false)", [tenantId, users.colleague.id]);
  try {
    await page.getByRole("button", { name: "Nieuwe notificatie", exact: true }).click();
    await dialog.getByLabel("Robin Notificatietest", { exact: true }).check();
    await expect(dialog.getByText("1 ontvangers", { exact: true })).toBeVisible();
    await dialog.getByLabel("Andere Notificatietest", { exact: true }).check();
    await expect(dialog.getByText("2 ontvangers", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
    const partialTitle = `Gedeeltelijk bereik ${fixture.slice(0, 8)}`;
    await dialog.getByLabel("Onderwerp", { exact: true }).fill(partialTitle);
    await dialog.getByLabel("Bericht", { exact: true }).fill("Fictieve berichttekst voor exact gecontroleerd e-mailbereik.");
    await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
    await dialog.getByLabel("In-app", { exact: true }).uncheck();
    await dialog.getByLabel("E-mail", { exact: true }).check();
    await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
    await expect(dialog.getByText("2 ontvangers", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 bereikbaar via gekozen kanalen", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 niet bereikbaar", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 daarvan door beleid of voorkeuren geblokkeerd", { exact: true })).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Verstuur naar 1 bereikbare ontvangers", exact: true });
    await expect(confirm).toBeEnabled(); await confirm.click();
    await expect(dialog).toHaveCount(0); await expect(page.getByRole("heading", { name: partialTitle, exact: true })).toBeVisible();
    const campaignId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect((await db.query("select user_id from private.notification_campaign_recipients where campaign_id=$1", [campaignId])).rows.map(row => row.user_id).sort()).toEqual([users.worker.id, users.colleague.id].sort());
  } finally { await db.query("delete from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='staff' and type_code is null", [tenantId, users.colleague.id]); }
});

test("een notificatie opent compact boven de inbox en behoudt de lijst bij sluiten", async ({ page }) => {
  await login(page, "manager", "/app/notificaties");
  const entry = page.locator(`.nt-inbox-item[href$='/${managerInboxId}']`);
  await entry.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/app/notificaties");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(640);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(element=>parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(0);
    await expect(page.locator(".nt-page .list-pagination")).toBeAttached();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  await page.goto(`/app/notificaties/${managerInboxId}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notificaties$/);
});
