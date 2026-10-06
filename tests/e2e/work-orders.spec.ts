import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import pg from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import sharp from "sharp";
import { authenticateWorkspace } from "./login-auth";

const title = `Werkbon dossier ${randomUUID().slice(0, 8)}`;
const templateName = `Checklist browser ${randomUUID().slice(0, 8)}`;
const personId = randomUUID(), day = "2033-10-05";
let db: pg.Client, tenant: string, extraUserId: string, orderId: string;
const createdOrders: string[] = [];
test.beforeAll(async () => {
  const database = requireLocalDatabaseUrl();
  db = new pg.Client({ connectionString: database.toString() });
  await db.connect();
  tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const account = await admin.auth.admin.createUser({ email: `work-order-${personId}@fieldgrid.test`, password: "Fieldgrid-E2E-2026", email_confirm: true });
  if (account.error) throw account.error;
  extraUserId = account.data.user.id;
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at) values($1,$2,array['staff']::public.app_role[],'active',now())", [tenant, extraUserId]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status) values($1,$2,$3,$4,'Milan Werkbontest','active')", [personId, tenant, extraUserId, `WB-${personId.slice(0, 8)}`]);
});
test.afterAll(async () => {
  if (!db) return;
  try {
    const ids = (await db.query("select id from public.work_orders where tenant_id=$1 and title=$2", [tenant, title])).rows.map(r => r.id);
    createdOrders.push(...ids);
    if (createdOrders.length) {
      const uploads = (await db.query("select storage_bucket,storage_path from public.attachments where tenant_id=$1 and work_order_id=any($2)", [tenant, createdOrders])).rows as Array<{ storage_bucket: string; storage_path: string }>;
      const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      for (const upload of uploads) {
        expect(upload.storage_bucket).toBe("reports");
        expect(createdOrders.some(id => upload.storage_path.startsWith(`${tenant}/${id}/communication/`))).toBe(true);
        const removed = await admin.storage.from(upload.storage_bucket).remove([upload.storage_path]);
        if (removed.error) throw removed.error;
      }
      await db.query("delete from public.planning_changes where work_order_id=any($1)", [createdOrders]);
      await db.query("delete from public.audit_events where entity_id=any($1)", [createdOrders]);
      const slots = (await db.query("select appointment_slot_id id from public.work_orders where id=any($1) and appointment_slot_id is not null", [createdOrders])).rows.map(row => row.id);
      await db.query("delete from public.work_orders where id=any($1)", [createdOrders]);
      await db.query("delete from public.appointment_slots where tenant_id=$1 and id=any($2)", [tenant, slots]);
    }
    const templates = (await db.query("select id from public.work_order_templates where tenant_id=$1 and name=$2", [tenant, templateName])).rows.map(r => r.id);
    if (templates.length) {
      // Only the isolated local fixture may bypass immutable-template retention.
      requireLocalDatabaseUrl();
      expect((await db.query("select slug from public.tenants where id=$1", [tenant])).rows[0].slug).toBe("fieldgrid-e2e");
      await db.query("begin");
      try {
        await db.query("set local session_replication_role='replica'");
        await db.query("delete from public.audit_events where entity_id=any($1)", [templates]);
        await db.query("delete from public.work_order_template_versions where template_id=any($1)", [templates]);
        await db.query("delete from public.work_order_templates where id=any($1)", [templates]);
        await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
    }
    await db.query("delete from public.personnel where id=$1", [personId]);
    if (extraUserId) {
      const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      const deleted = await admin.auth.admin.deleteUser(extraUserId);
      if (deleted.error) throw deleted.error;
    }
  } finally { await db.end(); }
});

async function login(page: Page) {
  page.setDefaultTimeout(15000);
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/werkbonnen");
  await expect(page.getByRole("heading", { name: "Werkbonnen", exact: true })).toBeVisible();
}

test("werkbonwizard bewaart een aankomstvenster en plant twee individuele inzetten later via het planbord", async ({ page, request }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page.getByRole("navigation", { name: "Werkweergave" }).getByRole("link")).toHaveCount(6);
  await expect(page.locator(".kanban")).toHaveCount(0);
  await page.getByRole("button", { name: "Nieuwe werkbon", exact: true }).click();
  const wizard = page.getByRole("dialog", { name: "Nieuwe werkbon", exact: true });
  await wizard.getByLabel("Klant", { exact: true }).selectOption("e2000000-0000-4000-8000-000000000001");
  await wizard.getByLabel("Object", { exact: true }).selectOption("e3000000-0000-4000-8000-000000000001");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await wizard.getByLabel("Titel", { exact: true }).fill(title);
  await wizard.getByLabel("Dienstcategorie", { exact: true }).fill("Onderhoud");
  await wizard.getByLabel("Taak toevoegen", { exact: true }).selectOption("e5000000-0000-4000-8000-000000000001");
  await wizard.getByLabel("Hoeveelheid (task)", { exact: true }).fill("6");
  await wizard.getByRole("button", { name: "Vorige" }).click();
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await expect(wizard.getByLabel("Titel", { exact: true })).toHaveValue(title);
  await expect(wizard.getByLabel("Hoeveelheid (task)", { exact: true })).toHaveValue("6");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await wizard.getByLabel("Instructies voor deze werkbon", { exact: true }).fill("Vandaag extra aandacht voor de entree.");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await wizard.getByLabel("Gewenste dag", { exact: true }).fill(day);
  await wizard.getByLabel("Gewenst tijdsvenster", { exact: true }).selectOption("08:00");
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await wizard.getByLabel("Klantondertekening", { exact: true }).selectOption("required");
  await expect(wizard.getByRole("button", { name: /Ondertekenen|Handtekening vastleggen/ })).toHaveCount(0);
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await expect(wizard.getByText("180 begrote arbeidsminuten.", { exact: true })).toBeVisible();
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(wizard.getByRole("button", { name: "Maak werkbon", exact: true })).toBeVisible();
  }
  await wizard.getByRole("button", { name: "Maak werkbon", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/werkbonnen\/[a-f0-9-]+$/);
  orderId = new URL(page.url()).pathname.split("/").at(-1)!;
  createdOrders.push(orderId);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect((await db.query("select planning_state,projected_start_at,projected_end_at,budget_labor_minutes from public.work_orders where id=$1", [orderId])).rows[0]).toMatchObject({ planning_state: "unassigned", projected_start_at: null, projected_end_at: null, budget_labor_minutes: 180 });
  expect((await db.query("select count(*)::int total from public.work_order_assignments where work_order_id=$1", [orderId])).rows[0].total).toBe(0);
  const number = (await db.query("select work_order_number from public.work_orders where id=$1", [orderId])).rows[0].work_order_number;
  await page.goto(`/app/planning?day=${day}`);
  await page.getByLabel("Bonnenweergave").selectOption("unassigned");
  await page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: "Plan", exact: true }).click();
  let planning = page.getByRole("dialog");
  await planning.getByLabel("Begin", { exact: true }).fill(`${day}T08:00`);
  await planning.getByLabel("Einde", { exact: true }).fill(`${day}T10:00`);
  await planning.getByLabel("Benodigde medewerkers", { exact: true }).fill("2");
  await planning.getByLabel("Robin de Vries", { exact: false }).check();
  await planning.getByLabel("Milan Werkbontest", { exact: false }).check();
  await planning.getByRole("button", { name: "Planning opslaan", exact: true }).click();
  await expect(planning).toHaveCount(0);
  await page.locator(`[data-order-id="${orderId}"]`).first().click();
  planning = page.getByRole("dialog");
  await planning.getByLabel("Omvang wijziging", { exact: true }).selectOption("single");
  await planning.getByLabel("Medewerker voor deze wijziging", { exact: true }).selectOption({ label: "Milan Werkbontest" });
  await planning.getByLabel("Begin", { exact: true }).fill(`${day}T09:00`);
  await planning.getByRole("button", { name: "Planning opslaan", exact: true }).click();
  await expect(planning).toHaveCount(0);
  await page.goto(`/app/werkbonnen/${orderId}`);
  const stored = await db.query("select (select count(*) from public.work_orders where tenant_id=$1 and title=$2)::int orders,(select count(*) from public.work_order_assignments where work_order_id=$3 and status<>'cancelled')::int crew,(select sum(extract(epoch from(projected_end_at-projected_start_at))/60) from public.work_order_assignments where work_order_id=$3 and status<>'cancelled')::int minutes,(select sum(quantity) from public.work_order_tasks where work_order_id=$3)::numeric quantity", [tenant, title, orderId]);
  expect(stored.rows[0]).toMatchObject({ orders: 1, crew: 2, minutes: 180 });
  expect(Number(stored.rows[0].quantity)).toBe(6);
  await page.getByRole("link", { name: "Planning & personeel", exact: true }).click();
  await expect(page.getByText(/3 geplande arbeidsuren · 2 uur bezoekduur/)).toBeVisible();
  await page.getByRole("link", { name: "Rapport & handtekening", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ondertekenen|Handtekening vastleggen/ })).toHaveCount(0);
  await page.goto(`/app/werkbonnen?q=${encodeURIComponent(title)}`);
  await expect(page.locator(".wo-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".wo-table")).toContainText("Milan Werkbontest");
  await page.getByRole("button", { name: /^Zoeken en filteren/ }).click();
  await page.getByLabel("Planningsstatus", { exact: true }).selectOption("tentative");
  await page.getByLabel("Uitvoeringsstatus", { exact: true }).selectOption("planned");
  await page.getByLabel("Facturatiestatus", { exact: true }).selectOption("not_ready");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await expect(page).toHaveURL(/planning=tentative/);
  await expect(page.locator(".wo-table tbody tr")).toHaveCount(1);
  await page.locator(".wo-table").getByRole("link", { name: /^Bekijk WB/ }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Planning & personeel", exact: true }).click();
  await page.getByRole("link", { name: "Terug naar overzicht", exact: true }).click();
  await expect(page).toHaveURL(/execution=planned/);
  await expect(page).toHaveURL(/billing=not_ready/);
  await expect(page.getByRole("link", { name: "Planning verwijderen", exact: true })).toContainText("Voorlopig gepland");
  await page.getByRole("link", { name: "Planning verwijderen", exact: true }).click();
  await expect(page).not.toHaveURL(/planning=tentative/);
  await expect(page.locator(".wo-table tbody tr")).toHaveCount(1);
  await page.goto(`/app/planning?day=${day}`);
  await expect(page.locator(`[data-order-id="${orderId}"]`)).toHaveCount(2);
  await page.locator(`[data-order-id="${orderId}"]`).first().click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Omvang wijziging", { exact: true }).selectOption("single");
  await panel.getByLabel("Medewerker voor deze wijziging", { exact: true }).selectOption({ label: "Milan Werkbontest" });
  await panel.getByLabel("Begin", { exact: true }).fill(`${day}T09:30`);
  await panel.getByRole("button", { name: "Planning opslaan", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const intervals = await db.query("select personnel_id,extract(epoch from(projected_end_at-projected_start_at))/60 minutes from public.work_order_assignments where work_order_id=$1 and status<>'cancelled' order by personnel_id", [orderId]);
  expect(Number(intervals.rows.find(r => r.personnel_id === personId).minutes)).toBe(30);
  expect(Number(intervals.rows.find(r => r.personnel_id === "e1000000-0000-4000-8000-000000000001").minutes)).toBe(120);

  await page.goto(`/app/werkbonnen/${orderId}?tab=communicatie`);
  const communication = page.locator("form").filter({ has: page.getByRole("button", { name: "Bericht / bestand toevoegen", exact: true }) });
  const body = communication.getByLabel("Bericht", { exact: true });
  const file = communication.locator('input[type="file"]');
  const note = `Veilig klantbericht ${title}`;
  await body.fill(note);
  await file.setInputFiles({ name: "niet-toegestaan.txt", mimeType: "text/plain", buffer: Buffer.from("Fictitious unsupported fixture") });
  await communication.getByRole("button", { name: "Bericht / bestand toevoegen", exact: true }).click();
  await expect(communication.getByRole("alert")).toContainText("Gebruik PDF, JPG of PNG");
  await expect(body).toHaveValue(note);
  expect(await file.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("niet-toegestaan.txt");
  expect((await db.query("select count(*)::int total from public.report_entries where work_order_id=$1 and body=$2", [orderId, note])).rows[0].total).toBe(0);
  expect((await db.query("select count(*)::int total from public.attachments where work_order_id=$1", [orderId])).rows[0].total).toBe(0);

  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#2d6878" } }).png().toBuffer();
  await file.setInputFiles({ name: "werkplek-test.png", mimeType: "image/png", buffer: png });
  await communication.getByLabel("Opnemen in het klantrapport na controle", { exact: true }).check();
  // Chromium omits multipart upload bodies from Request.postDataBuffer().
  // Replay this one authorized FormData transport unchanged inside the browser.
  await page.evaluate((uniqueNote) => {
    const original = window.fetch.bind(window);
    const observed = window as Window & { workOrderReplay?: { status: number; ok: boolean } };
    window.fetch = async (input, init) => {
      if (init?.method === "POST" && init.body instanceof FormData && [...init.body.values()].some(value => typeof value === "string" && value.includes(uniqueNote))) {
        window.fetch = original;
        const first = await original(input, init);
        const retryHeaders = new Headers(init.headers);
        // A replay is a new transport request; do not reuse Next dev's debug stream.
        retryHeaders.delete("x-nextjs-request-id");
        retryHeaders.delete("x-nextjs-html-request-id");
        const retry = await original(input, { ...init, headers: retryHeaders });
        observed.workOrderReplay = { status: retry.status, ok: (await retry.text()).includes('"ok":true') };
        return first;
      }
      return original(input, init);
    };
  }, note);
  await communication.getByRole("button", { name: "Bericht / bestand toevoegen", exact: true }).click();
  await expect(body).toHaveValue("");
  expect(await page.evaluate(() => (window as Window & { workOrderReplay?: { status: number; ok: boolean } }).workOrderReplay)).toEqual({ status: 200, ok: true });
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  const first = (await db.query("select a.id,a.storage_bucket,a.storage_path,a.sha256,a.mime_type,a.size_bytes::int size_bytes,a.customer_visible,r.body from public.attachments a join public.report_entries r on r.id=a.report_entry_id where a.work_order_id=$1 and a.file_name='werkplek-test.png'", [orderId])).rows;
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ storage_bucket: "reports", mime_type: "image/png", size_bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), customer_visible: true, body: note });
  expect(first[0].storage_path).toMatch(new RegExp(`^${tenant}/${orderId}/communication/[a-f0-9-]+\\.png$`));
  expect((await db.query("select count(*)::int total from public.report_entries where work_order_id=$1 and body=$2", [orderId, note])).rows[0].total).toBe(1);
  expect((await db.query("select count(*)::int total from public.attachments where work_order_id=$1", [orderId])).rows[0].total).toBe(1);
  const pngDownload = await page.request.get(`/api/files/attachment/${first[0].id}`);
  expect(pngDownload.status()).toBe(200);
  expect(pngDownload.headers()["content-type"]).toContain("image/png");
  expect(await pngDownload.body()).toEqual(png);
  expect((await request.get(`/api/files/attachment/${first[0].id}`)).status()).toBe(404);

  const pdfDocument = await PDFDocument.create();
  pdfDocument.addPage([100, 100]).drawText("Fictitious work order");
  const pdf = Buffer.from(await pdfDocument.save());
  await file.setInputFiles({ name: "oplevering-test.pdf", mimeType: "application/pdf", buffer: pdf });
  await communication.getByRole("button", { name: "Bericht / bestand toevoegen", exact: true }).click();
  await expect(page.getByText("oplevering-test.pdf", { exact: true })).toBeVisible();
  const second = (await db.query("select id,storage_path,mime_type,sha256,size_bytes::int size_bytes from public.attachments where work_order_id=$1 and file_name='oplevering-test.pdf'", [orderId])).rows;
  expect(second).toHaveLength(1);
  expect(second[0]).toMatchObject({ mime_type: "application/pdf", sha256: createHash("sha256").update(pdf).digest("hex"), size_bytes: pdf.length });
  expect(second[0].storage_path).toMatch(new RegExp(`^${tenant}/${orderId}/communication/[a-f0-9-]+\\.pdf$`));
  const pdfDownload = await page.request.get(`/api/files/attachment/${second[0].id}`);
  expect(pdfDownload.status()).toBe(200);
  expect(pdfDownload.headers()["content-type"]).toContain("application/pdf");
  expect(await pdfDownload.body()).toEqual(pdf);

  await page.goto(`/app/werkbonnen/${orderId}?tab=planning`);
  await page.getByRole("row").filter({ hasText: "Milan Werkbontest" }).getByRole("button", { name: "Verwijder", exact: true }).click();
  let management = page.getByRole("dialog", { name: "Medewerker van werkbon verwijderen", exact: true });
  await management.getByLabel("Reden", { exact: true }).fill("Medewerker wordt op een andere opdracht ingezet.");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => management.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(management.getByRole("button", { name: "Medewerker verwijderen", exact: true })).toBeVisible();
  }
  await management.getByRole("button", { name: "Medewerker verwijderen", exact: true }).click();
  await expect(management).toHaveCount(0);
  expect((await db.query("select status from public.work_order_assignments where work_order_id=$1 and personnel_id=$2", [orderId, personId])).rows[0].status).toBe("returned");
  for (const status of ["released", "returned", "planned"]) {
    await page.getByRole("button", { name: "Status wijzigen", exact: true }).click();
    management = page.getByRole("dialog", { name: "Status wijzigen", exact: true });
    await management.getByLabel("Nieuwe status", { exact: true }).selectOption(status);
    await management.getByLabel("Reden", { exact: true }).fill(`Gemotiveerde browsercontrole: ${status}.`);
    await management.getByRole("button", { name: "Status vastleggen", exact: true }).click();
    await expect(management).toHaveCount(0);
    expect((await db.query("select status from public.work_orders where id=$1", [orderId])).rows[0].status).toBe(status);
  }
});

test("checklistbeheer bewaart zes antwoordtypes en maakt een nieuwe versie na publicatie", async ({ page }) => {
  test.setTimeout(90000);
  await login(page);
  await page.getByRole("button", { name: /^Zoeken en filteren/ }).click();
  await page.getByRole("link", { name: "Templates beheren", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Werkbon- en checklisttemplates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nieuwe checklist", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Naam", { exact: true }).fill(templateName);
  const types = ["check", "boolean", "choice", "text", "number", "photo"];
  for (const [i, type] of types.entries()) {
    if (i) await editor.getByRole("button", { name: "Vraag toevoegen", exact: true }).click();
    const question = editor.locator(".wo-template-question").nth(i);
    await question.getByLabel("Sectie", { exact: true }).fill("Oplevering");
    await question.getByLabel("Vraag", { exact: true }).fill(`Controle ${type}`);
    await question.getByLabel(/^Antwoordtype/).selectOption(type);
    if (type === "choice") await question.getByLabel("Opties, één per regel", { exact: true }).fill("Akkoord\nHerstel nodig");
    if (type === "number") await question.getByLabel("Eenheid", { exact: true }).fill("m²");
    if (type === "text") {
      await question.getByLabel(/^Alleen tonen na antwoord op/).selectOption({ label: "Controle boolean" });
      await question.getByLabel(/^Wanneer antwoord gelijk is aan/).selectOption("false");
      await question.getByLabel("In klantrapport", { exact: true }).uncheck();
    }
    if (type === "boolean") await question.getByLabel("Niet van toepassing met reden toestaan", { exact: true }).check();
  }
  await expect(editor.locator(".wo-template-question")).toHaveCount(6);
  await expect(editor.getByRole("option", { name: /Handtekening|Ondertekening/ })).toHaveCount(0);
  await editor.getByRole("button", { name: "Concept opslaan", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const rows = page.getByRole("row").filter({ hasText: templateName });
  await expect(rows).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept());
  await rows.getByRole("button", { name: "Publiceer", exact: true }).click();
  await expect(rows).toContainText("Gepubliceerd");
  const before = await db.query("select v.id,v.version,v.state,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where t.tenant_id=$1 and t.name=$2", [tenant, templateName]);
  expect(before.rows).toHaveLength(1);
  expect(before.rows[0].definition.questions.map((q: { type: string }) => q.type)).toEqual(types);
  expect(before.rows[0].definition.questions[3].condition.equals).toBe(false);
  expect(before.rows[0].definition.questions[3].customerVisible).toBe(false);
  await rows.getByRole("button", { name: "Bekijk / nieuwe versie", exact: true }).click();
  await editor.locator(".wo-template-question").first().getByLabel("Vraag", { exact: true }).fill("Nieuwe controle voor volgende bonnen");
  await editor.getByRole("button", { name: "Nieuwe conceptversie opslaan", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  const after = await db.query("select v.id,v.version,v.state,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where t.tenant_id=$1 and t.name=$2 order by v.version", [tenant, templateName]);
  expect(after.rows[0]).toEqual(before.rows[0]);
  expect(after.rows[1].version).toBe(2);
  expect(after.rows[1].state).toBe("draft");
  expect(after.rows[1].definition.questions[0].label).toBe("Nieuwe controle voor volgende bonnen");
});
