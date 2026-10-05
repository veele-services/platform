import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import sharp from "sharp";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { E2E_APP_ORIGIN } from "./staff-auth";
import { authenticateWorkspace } from "./login-auth";

const fixture = randomUUID(), tenantId = randomUUID(), orderId = randomUUID(), objectId = randomUUID(), customerId = randomUUID();
const tenantName = `Meldingen browser ${fixture.slice(0, 8)}`, tenantSlug = `tickets-e2e-${fixture.slice(0, 8)}`;
const password = "Fieldgrid-E2E-2026";
const users: Record<string, { id: string; email: string; personnelId?: string }> = {};
let db: pg.Client, categoryId: string;
let admin: ReturnType<typeof createClient>;

test.beforeAll(async () => {
  const url = requireLocalDatabaseUrl();
  requireLocalApiUrl();
  db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  for (const role of ["manager", "worker", "colleague", "platform", "config"]) {
    const email = `${role}-${fixture}@fieldgrid.test`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error) throw result.error;
    users[role] = { id: result.data.user.id, email };
  }
  await db.query("insert into public.tenants(id,name,slug) values($1,$2,$3)", [tenantId, tenantName, tenantSlug]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','tickets'])", [tenantId]);
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color) values($1,'#214E72','#C65D21')", [tenantId]);
  for (const role of ["manager", "worker", "colleague"]) {
    const membership = (await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at) values($1,$2,array[$3]::public.app_role[],'active',now()) returning id", [tenantId, users[role].id, role === "manager" ? "tenant_admin" : "staff"])).rows[0].id;
    await db.query("select private.ticket_seed_membership($1)", [membership]);
    if (role === "manager") {
      for (const capability of ["tickets.internal.share", "tickets.support.read", "tickets.support.create", "tickets.support.reply", "tickets.support.manage", "tickets.support.note"]) await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,$4,'{\"all\":true}') on conflict do nothing", [tenantId, users[role].id, membership, capability]);
    } else {
      users[role].personnelId = randomUUID();
      await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,employee_number,status,onboarding_step,onboarding_completed_at) values($1,$2,$3,$4,$5,'active',5,now())", [users[role].personnelId, tenantId, users[role].id, role === "worker" ? "Robin Tickettest" : "Collega Tickettest", role === "worker" ? "T-001" : "T-002"]);
    }
  }
  await db.query("insert into public.platform_admins(user_id) values($1)", [users.platform.id]);
  for (const capability of ["platform.support.read", "platform.support.reply", "platform.support.note", "platform.support.manage"]) await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,$2,$3)", [users.platform.id, capability, { tenant_ids: [tenantId] }]);
  await db.query("insert into public.platform_admins(user_id) values($1)", [users.config.id]);
  await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,'platform.support.config','{\"all\":true}') on conflict do nothing", [users.config.id]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'T-KL-001','Fictieve ticketklant')", [customerId, tenantId]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'T-OB-001','Fictieve ticketlocatie',$4)", [objectId, tenantId, customerId, { street: "Teststraat 14", postal_code: "1234 AB", city: "Teststad", country: "NL" }]);
  await db.query("insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,title,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,'WB-TICKET-001',$3,$4,'Ticketcontext browser','Onderhoud','released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z',$5)", [orderId, tenantId, customerId, objectId, users.manager.id]);
  for (const role of ["worker", "colleague"]) {
    const assignment = (await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z') returning id", [tenantId, orderId, users[role].personnelId])).rows[0].id;
    await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)", [tenantId, orderId, assignment, users.manager.id, `ticket-${fixture}-${role}`]);
  }
  categoryId = (await db.query("select id from public.ticket_categories where tenant_id=$1 and code='technical'", [tenantId])).rows[0].id;
});

test.afterAll(async () => {
  if (!db) return;
  try {
    // Test data only: immutable conversations may only be removed under the
    // isolated local fixture boundary, never through a product delete action.
    requireLocalDatabaseUrl();
    const tenant = (await db.query("select slug from public.tenants where id=$1", [tenantId])).rows[0];
    if (tenant) {
      expect(tenant.slug).toBe(tenantSlug);
      const files = (await db.query("select quarantine_path,storage_path from public.ticket_files where tenant_id=$1", [tenantId])).rows;
      const paths = files.flatMap(row => [row.quarantine_path, row.storage_path]).filter((path): path is string => typeof path === "string");
      for (const path of paths) expect(path.startsWith(`${tenantId}/`)).toBe(true);
      if (paths.length) { const result = await admin.storage.from("ticket-files").remove(paths); if (result.error) throw result.error; }
      const tables = (await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private') and table_name in (select tablename from pg_tables where schemaname in ('public','private'))")).rows;
      await db.query("begin");
      try {
        await db.query("set local session_replication_role='replica'");
        const fixtureUsers = Object.values(users).map(user => user.id);
        await db.query("delete from public.ticket_group_members where user_id=any($1::uuid[])", [fixtureUsers]);
        await db.query("delete from private.ticket_reads where user_id=any($1::uuid[])", [fixtureUsers]);
        await db.query("delete from private.ticket_redactions where actor_id=any($1::uuid[])", [fixtureUsers]);
        for (const name of ["ticket_audit", "ticket_receipts", "ticket_verifications"]) await db.query(`delete from private.${name} where actor_id=any($1::uuid[])`, [fixtureUsers]);
        for (const row of tables) {
          expect(row.table_schema).toMatch(/^(public|private)$/); expect(row.table_name).toMatch(/^[a-z_]+$/);
          await db.query(`delete from "${row.table_schema}"."${row.table_name}" where tenant_id=$1`, [tenantId]);
        }
        await db.query("delete from private.ticket_config where scope_key=$1", [tenantId]);
        await db.query("delete from public.permission_grants where user_id=any($1::uuid[])", [Object.values(users).map(user => user.id)]);
        await db.query("delete from public.platform_admins where user_id=any($1::uuid[])", [fixtureUsers]);
        await db.query("delete from public.tenants where id=$1", [tenantId]);
        await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
    }
    for (const user of Object.values(users)) { const result = await admin.auth.admin.deleteUser(user.id); if (result.error) throw result.error; }
  } finally { await db.end(); }
});

async function login(page: Page, role: string, path: string) {
  page.setDefaultTimeout(20000);
  await authenticateWorkspace(page, users[role].email, path, password);
  await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, "\\?")));
}
async function expectTicketListReady(page: Page, workspace: "staff" | "tenant", subject: string) {
  await expect(page.getByRole("heading", { name: workspace === "staff" ? "Mijn meldingen" : "Personeelsmeldingen", exact: true })).toBeVisible();
  await expect(page.locator(".ticket-workspace")).toHaveAttribute("aria-busy", "false");
  if (workspace === "tenant") await expect(page.locator(".ticket-table")).toBeVisible();
  const item = page.locator(workspace === "staff" ? ".ticket-staff-card" : ".ticket-table tbody tr").filter({ hasText: subject });
  await expect(item).toHaveCount(1);
  await expect(item).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Meldingen laden…" })).toHaveCount(0);
  const filters = page.getByRole("button", { name: /^Zoeken en filteren/ });
  await expect(filters).toBeVisible();
  await expect(page.getByLabel("Sortering", { exact: true })).toHaveCount(0);
  await filters.click();
  const popover = page.locator(".ticket-filter-popover");
  await expect(popover.getByLabel("Sortering", { exact: true })).toBeVisible();
  await expect(popover.getByLabel("Sorteerrichting", { exact: true })).toBeVisible();
  await expect.poll(() => popover.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(filters).toBeFocused();
}
async function screenshotSizes(page: Page, label: string, ready?: () => Promise<void>) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    if (ready) await ready();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect.poll(() => page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
      const overflow = [...document.querySelectorAll("body *")].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.left >= 0 && rect.right > innerWidth + 1 && getComputedStyle(element).position !== "absolute";
      }).map(element => element.tagName + "." + element.className).slice(0, 8);
      return { valid: (!dialog || dialog.left >= 0 && dialog.right <= innerWidth + 1) && document.documentElement.scrollWidth <= innerWidth, viewport: innerWidth, document: document.documentElement.scrollWidth, dialog: dialog ? { left: dialog.left, right: dialog.right } : null, overflow: document.documentElement.scrollWidth > innerWidth ? overflow : [] };
    })).toMatchObject({ valid: true, overflow: [] });
    await page.screenshot({ path: `test-results/tickets-${label}-${width}.png`, fullPage: true });
  }
}

test("personeelsmelding met echte scan, private notitie, bewuste escalatie en onafhankelijk platformgesprek", async ({ page, browser }) => {
  test.setTimeout(300000);
  const subject = `Technische hulp ${fixture.slice(0, 8)}`;
  const note = `TENANT-PRIVATE-${fixture}`, platformNote = `PLATFORM-PRIVATE-${fixture}`;
  await login(page, "worker", `/staff?workOrder=${orderId}`);
  await page.getByRole("link", { name: "Probleem melden", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Nieuwe melding", exact: true });
  await form.getByLabel("Onderwerp", { exact: true }).fill(subject);
  await form.getByLabel("Categorie", { exact: true }).selectOption(categoryId);
  await form.getByLabel("Omschrijving", { exact: true }).fill("Het openen van de instructie geeft een fout. Deze fictieve tekst bevat geen geheime codes.");
  await expect(form.getByLabel("Werkbon of object")).toHaveValue(orderId);
  await form.getByLabel("Bijlagen toevoegen").setInputFiles({ name: "verboden.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic unsupported fixture") });
  await expect(form.getByRole("alert")).toContainText("Gebruik JPG");
  await expect(form.getByLabel("Onderwerp", { exact: true })).toHaveValue(subject);
  const png = await sharp({ create: { width: 3, height: 3, channels: 4, background: "#214e72" } }).png().toBuffer();
  await form.getByLabel("Bijlagen toevoegen").setInputFiles({ name: "instructie-test.png", mimeType: "image/png", buffer: png });
  await expect(form.getByText(/KB · Beschikbaar/)).toBeVisible({ timeout: 45000 });
  await screenshotSizes(page, "staff-create");
  await form.getByRole("button", { name: "Melding versturen", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/meldingen\/[a-f0-9-]+$/);
  const ticketId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
  const files = (await db.query("select id,scan_status,scanner_engine,scanned_at,storage_path,sha256 from public.ticket_files where ticket_id=$1", [ticketId])).rows;
  expect(files).toHaveLength(1); expect(files[0].scan_status).toBe("clean"); expect(files[0].scanner_engine).toContain("ClamAV"); expect(files[0].scanned_at).toBeTruthy();
  const staffFileUrl = await page.getByRole("link", { name: "Openen", exact: true }).getAttribute("href");
  expect((await page.request.get(staffFileUrl!)).ok()).toBe(true);
  await screenshotSizes(page, "staff-detail");

  const managerContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN }), manager = await managerContext.newPage();
  await login(manager, "manager", `/app/meldingen?search=${encodeURIComponent(subject)}`);
  await expect(manager.locator(".ticket-table tbody tr")).toHaveCount(1);
  await manager.locator(".ticket-table").getByRole("link", { name: /^Bekijk/ }).click();
  await manager.getByRole("button", { name: "Toewijzen", exact: true }).click();
  const assign = manager.getByRole("dialog", { name: "Behandelaar toewijzen" });
  await assign.getByLabel("Behandelaar", { exact: true }).selectOption(users.manager.id);
  await assign.getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(assign).toHaveCount(0);
  // Assignment increments the ticket revision. Reload the confirmed detail
  // before issuing the next revision-bound command instead of racing the
  // asynchronous router refresh on slower hosted runners.
  await manager.reload();
  await expect(manager.getByRole("heading", { name: subject, exact: true })).toBeVisible();
  await manager.getByLabel("Zichtbaarheid", { exact: true }).selectOption("tenant");
  await manager.getByLabel("Interne notitie", { exact: true }).fill(note);
  await manager.getByRole("button", { name: "Interne notitie plaatsen", exact: true }).click();
  await expect(manager.getByLabel("Interne notitie", { exact: true })).toHaveValue("", { timeout: 45_000 });
  await manager.reload();
  await expect(manager.locator(".ticket-message").getByText(note, { exact: true })).toBeVisible({ timeout: 30_000 });
  const staffPayload = await page.request.get(`/staff/meldingen/${ticketId}`);
  expect(await staffPayload.text()).not.toContain(note);
  await page.reload();
  await expect(page.getByText(note, { exact: true })).toHaveCount(0);
  const coworkerContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN }), coworker = await coworkerContext.newPage();
  await login(coworker, "colleague", "/staff/meldingen");
  await expect(coworker.getByText(subject, { exact: true })).toHaveCount(0);
  const colleagueResponse = await coworker.request.get(`/staff/meldingen/${ticketId}`);
  expect(await colleagueResponse.text()).not.toContain(subject);
  expect((await coworker.request.get(staffFileUrl!)).status()).toBe(404);

  await manager.getByRole("button", { name: "Doorsturen naar Fieldgrid", exact: true }).click();
  const share = manager.getByRole("dialog", { name: "Doorsturen naar Fieldgrid", exact: true });
  await share.getByLabel("Onderwerp voor Fieldgrid").fill(`Gedeeld technisch probleem ${fixture.slice(0, 8)}`);
  await share.getByLabel("Supportcategorie").selectOption({ label: "Technische storing" });
  await share.getByLabel("Betrokken module").selectOption("werkbonnen");
  await share.getByLabel("Technische omschrijving").fill("Fictieve reproduceerbare fout bij openen van een instructie. Geen medewerkernaam of intern gesprek gedeeld.");
  await share.getByRole("button", { name: "Volgende", exact: true }).click();
  await expect(share.getByRole("checkbox")).toHaveCount(1);
  await expect(share.getByRole("checkbox")).not.toBeChecked();
  await share.getByRole("checkbox").check();
  await share.getByRole("button", { name: "Volgende", exact: true }).click();
  await expect(share.getByText("instructie-test.png", { exact: false })).toBeVisible();
  await expect(share.getByText(note, { exact: true })).toHaveCount(0);
  await screenshotSizes(manager, "share-review");
  await share.getByRole("button", { name: "Supportticket aanmaken", exact: true }).click();
  await expect(manager).toHaveURL(/\/app\/support\/[a-f0-9-]+$/);
  const supportId = new URL(manager.url()).pathname.split("/").at(-1)!;
  expect(supportId).not.toBe(ticketId);
  expect((await db.query("select count(*)::int count from private.ticket_links where source_ticket_id=$1", [ticketId])).rows[0].count).toBe(1);

  const platformContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN }), platform = await platformContext.newPage();
  await login(platform, "platform", `/platform/support/${supportId}`);
  await expect(platform.getByText(note, { exact: true })).toHaveCount(0);
  const platformPayload = await platform.request.get(`/platform/support/${supportId}`), platformHtml = await platformPayload.text();
  expect(platformHtml).not.toContain(note); expect(platformHtml).not.toContain(ticketId); expect(platformHtml).not.toContain("Robin Tickettest");
  await expect(platform.getByRole("link", { name: /Personeelsmelding|Open MEL/ })).toHaveCount(0);
  await platform.getByLabel("Zichtbaarheid", { exact: true }).selectOption("platform");
  await platform.getByLabel("Interne notitie", { exact: true }).fill(platformNote);
  await platform.getByRole("button", { name: "Interne notitie plaatsen", exact: true }).click();
  await expect(platform.locator(".ticket-message").getByText(platformNote, { exact: true })).toBeVisible();
  expect(await (await manager.request.get(`/app/support/${supportId}`)).text()).not.toContain(platformNote);
  await platform.getByLabel("Zichtbaarheid", { exact: true }).selectOption("reporter");
  await platform.getByLabel("Bericht", { exact: true }).fill("Fictieve technische analyse: probeer de instructie opnieuw te openen.");
  await platform.getByRole("button", { name: "Antwoord versturen", exact: true }).click();
  await expect(platform.locator(".ticket-message").getByText("Fictieve technische analyse: probeer de instructie opnieuw te openen.", { exact: true })).toBeVisible();
  await screenshotSizes(platform, "platform-detail");
  await platform.getByRole("button", { name: "Oplossen", exact: true }).click();
  const resolve = platform.getByRole("dialog", { name: "Oplossing vastleggen", exact: true });
  await resolve.getByLabel("Oplossing voor de melder").fill("Fictieve technische correctie is afgerond; controleer het resultaat.");
  await resolve.getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(resolve).toHaveCount(0);
  expect((await db.query("select status from public.tickets where id=$1", [ticketId])).rows[0].status).not.toBe("closed");
  await manager.reload();
  await manager.getByRole("button", { name: "Antwoord voorbereiden voor medewerker", exact: true }).first().click();
  const draft = manager.getByRole("dialog", { name: "Antwoord voorbereiden voor medewerker", exact: true });
  await draft.getByLabel("Bericht", { exact: true }).fill("We hebben de technische correctie gecontroleerd. Wil je het nogmaals proberen?");
  await draft.getByRole("button", { name: "Antwoord versturen", exact: true }).click();
  await expect(draft).toHaveCount(0);
  await manager.goto(`/app/meldingen/${ticketId}`);
  await manager.getByRole("button", { name: "Oplossen", exact: true }).click();
  const managerResolve = manager.getByRole("dialog", { name: "Oplossing vastleggen", exact: true });
  await managerResolve.getByLabel("Oplossing voor de melder").fill("De instructie kan weer worden geopend.");
  await managerResolve.getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(managerResolve).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Nog niet opgelost", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Reden / toelichting").fill("Ik zie nog steeds dezelfde foutmelding.");
  await page.getByRole("dialog").getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await db.query("select status from public.tickets where id=$1", [ticketId])).rows[0].status).toBe("in_progress");
  await manager.reload();
  await manager.getByRole("button", { name: "Oplossen", exact: true }).click();
  await manager.getByRole("dialog").getByLabel("Oplossing voor de melder").fill("De aanvullende fout is nu ook verholpen.");
  await manager.getByRole("dialog").getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(manager.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Oplossing bevestigen", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Reden / toelichting").fill("Het werkt weer, bedankt.");
  await page.getByRole("dialog").getByRole("button", { name: "Bevestigen", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await db.query("select status from public.tickets where id=$1", [ticketId])).rows[0].status).toBe("closed");
  await page.goto("/staff/meldingen");
  await screenshotSizes(page, "staff-list", () => expectTicketListReady(page, "staff", subject));
  await manager.goto("/app/meldingen");
  await screenshotSizes(manager, "tenant-list", () => expectTicketListReady(manager, "tenant", subject));
  const cachedUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat());
  expect(cachedUrls.filter(url => /\/(meldingen|support)(?:\/|\?|$)/.test(url))).toEqual([]);
  await manager.getByRole("button", { name: "Uitloggen", exact: true }).click();
  await expect(manager).toHaveURL(/\/login/);
  const signedOut = await manager.request.get(`/app/meldingen/${ticketId}`);
  const signedOutHtml = await signedOut.text();
  expect(signedOutHtml).not.toContain(subject); expect(signedOutHtml).not.toContain(note);
  await manager.goBack();
  await expect(manager.getByText(subject, { exact: true })).toHaveCount(0);
  await managerContext.close(); await coworkerContext.close(); await platformContext.close();
});

test("categorieconfiguratie en expliciete begrensde grant vereisen payloadgebonden verificatie", async ({ page, request }) => {
  test.setTimeout(150000);
  await login(page, "manager", "/app/meldingen/instellingen");
  await page.getByRole("button", { name: "Groep", exact: true }).click();
  const group = page.getByRole("dialog", { name: "Behandelaarsgroep toevoegen" });
  await group.getByLabel("Groepsnaam").fill("Fictieve technische intake");
  await group.getByLabel("Actieve groepsleden").selectOption(users.manager.id);
  await group.getByRole("button", { name: "Groep opslaan" }).click();
  await expect(group).toHaveCount(0);
  await expect(page.getByText("Fictieve technische intake", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "App en techniek bewerken", exact: true }).click();
  const category = page.getByRole("dialog", { name: "Categorie & routing bewerken" });
  await category.getByLabel("Behandelaarsgroep", { exact: true }).selectOption({ label: "Fictieve technische intake" });
  await category.getByLabel("Reactietermijn (werkminuten)").fill("120");
  await category.getByRole("button", { name: "Categorie opslaan" }).click();
  await expect(category).toHaveCount(0);
  expect((await db.query("select first_response_minutes from public.ticket_categories where id=$1", [categoryId])).rows[0].first_response_minutes).toBe(120);
  await page.getByRole("button", { name: "Bevoegdheid toekennen", exact: true }).click();
  const grant = page.getByRole("dialog", { name: "Begrensde bevoegdheid toekennen", exact: true });
  await grant.getByLabel("Actieve gebruiker", { exact: true }).selectOption(users.colleague.id);
  await grant.getByLabel("Centraal geregistreerd recht").selectOption("tickets.internal.read");
  await grant.getByLabel("Categorieën", { exact: true }).selectOption(categoryId);
  await grant.getByLabel("Medewerkers in bereik").selectOption(users.worker.personnelId!);
  await grant.getByLabel("Reden", { exact: true }).fill("Fictieve gedelegeerde technische inzage voor één medewerker.");
  await grant.getByRole("button", { name: "Controleer wijziging" }).click();
  await grant.getByRole("button", { name: "Verificatiecode aanvragen" }).click();
  await expect(grant.getByLabel("Verificatiecode", { exact: true })).toBeVisible();
  expect((await db.query("select count(*)::int count from public.permission_grants where user_id=$1 and capability='tickets.internal.read'", [users.colleague.id])).rows[0].count).toBe(0);
  const mailbox = await request.get(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(users.manager.email)}`);
  const mails = await mailbox.json() as Array<{ content: Array<{ type: string; value: string }> }>;
  const text = mails.at(-1)!.content.find(content => content.type === "text/plain")!.value;
  const code = text.match(/\b\d{6}\b/)?.[0]; expect(code).toBeTruthy();
  await grant.getByLabel("Verificatiecode", { exact: true }).fill(code!);
  await screenshotSizes(page, "grant-review");
  await grant.getByRole("button", { name: "Verifiëren en toekennen" }).click();
  await expect(grant).toHaveCount(0);
  const scope = (await db.query("select scope from public.permission_grants where user_id=$1 and capability='tickets.internal.read'", [users.colleague.id])).rows[0].scope;
  expect(scope.category_ids).toEqual([categoryId]); expect(scope.personnel_ids).toEqual([users.worker.personnelId]); expect(scope.all).not.toBe(true);
  await screenshotSizes(page, "settings");
});

test("configuratiebevoegdheid geeft geen gesprekstoegang; personeel ziet alleen eigen notificatievoorkeuren", async ({ page, browser }) => {
  test.setTimeout(60000);
  await login(page, "config", "/platform/support");
  await expect(page).toHaveURL(/\/platform\/support\/instellingen$/);
  await expect(page.getByRole("heading", { name: "Categorieën & routing", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  const tickets = (await db.query("select id,title from public.tickets where tenant_id=$1 and route='platform_support'", [tenantId])).rows;
  for (const ticket of tickets) {
    const response = await page.request.get(`/platform/support/${ticket.id}`);
    expect(await response.text()).not.toContain(ticket.title);
  }
  const staffContext = await browser.newContext({ baseURL: E2E_APP_ORIGIN }), staff = await staffContext.newPage();
  await login(staff, "worker", "/staff/meldingen/instellingen");
  await expect(staff.getByRole("heading", { name: "Mijn notificatievoorkeuren" })).toBeVisible();
  await expect(staff.getByRole("heading", { name: "Categorieën & routing", exact: true })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: "Bevoegdheid toekennen", exact: true })).toHaveCount(0);
  await staff.getByLabel("E-mail bij relevante ticketupdates").uncheck();
  await staff.getByRole("button", { name: "Voorkeuren opslaan", exact: true }).click();
  await expect(staff.locator("form").filter({ has: staff.getByRole("button", { name: "Voorkeuren opslaan", exact: true }) }).getByRole("status")).toHaveText("Voorkeuren opgeslagen.");
  await staff.reload();
  await expect(staff.getByLabel("E-mail bij relevante ticketupdates")).not.toBeChecked();
  await screenshotSizes(staff, "staff-preferences");
  await staffContext.close();
});

test("ticketbezorging gebruikt de echte worker en alleen de lokale testmailbox", async () => {
  test.setTimeout(60000);
  // This test must also work after Playwright restarts its worker, or when
  // selected alone. Do not depend on tickets created by the browser flow.
  const supportCategory = (await db.query("select id from public.ticket_categories where tenant_id is null and route='platform_support' and code='technical' and archived_at is null")).rows[0];
  expect(supportCategory).toBeTruthy();
  for (const [role, workspace, category] of [["worker", "staff", categoryId], ["manager", "support", supportCategory.id]] as const) {
    const client = createClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const login = await client.auth.signInWithPassword({ email: users[role].email, password });
      expect(login.error).toBeNull();
      const created = await client.rpc("ticket_command", {
        target_tenant: tenantId, actor_context: workspace, command: "create", request_id: randomUUID(),
        payload: { category_id: category, title: `Fictieve ${workspace} transportcontrole`, body: "Zelfstandige lokale fixture voor veilige notificatiebezorging.", urgency: "normal", module: "overig", technical_context: { environment: "development", release: "local" }, attachment_ids: [] },
      });
      expect(created.error).toBeNull();
      expect(created.data?.id).toMatch(/^[a-f0-9-]{36}$/);
    } finally { await client.auth.signOut({ scope: "local" }); }
  }
  const output = execFileSync(process.execPath, ["--conditions=react-server", "--import=tsx", "--import=./tests/e2e/sendgrid-interceptor.mjs", "tests/e2e/run-ticket-delivery.ts", tenantId], {
    cwd: process.cwd(), encoding: "utf8", timeout: 50000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DEPLOY_TARGET: "local", APP_ENV: "development", APP_URL: "http://127.0.0.1:3000", FIELDGRID_TEST_SENDGRID: "1", SENDGRID_API_KEY: "SG.fieldgrid-local-e2e-placeholder", SENDGRID_FROM_EMAIL: "noreply@fieldgrid.test" },
  });
  expect(output).toContain("Ticket and central transport fixture passed");
});
