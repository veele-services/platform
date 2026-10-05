import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

const customerId = "e2000000-0000-4000-8000-000000000001";
const objectId = "e3000000-0000-4000-8000-000000000001";
const taskId = "e5000000-0000-4000-8000-000000000001";
const day = "2033-10-05";

async function next(page: Page, count = 1) {
  for (let index = 0; index < count; index++) await page.getByRole("dialog").getByRole("button", { name: "Volgende", exact: true }).click();
}
async function cleanup(db: pg.Client, tenant: string, title: string) {
  const orders = (await db.query("select id,appointment_slot_id from public.work_orders where tenant_id=$1 and title=$2", [tenant, title])).rows;
  const ids = orders.map(order => order.id);
  await db.query("delete from public.planning_changes where tenant_id=$1 and work_order_id=any($2)", [tenant, ids]);
  await db.query("delete from public.audit_events where tenant_id=$1 and entity_id=any($2)", [tenant, ids]);
  await db.query("delete from public.work_orders where tenant_id=$1 and id=any($2)", [tenant, ids]);
  await db.query("delete from public.appointment_slots where tenant_id=$1 and id=any($2)", [tenant, orders.map(order => order.appointment_slot_id).filter(Boolean)]);
}

test("nieuwe werkbon vraagt alleen een dag en twee-uursvenster en houdt taakduur los van planning", async ({ page }, info) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  const title = `Fictief aankomstvenster ${randomUUID().slice(0, 8)}`;
  try {
    await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/werkbonnen");
    await page.getByRole("button", { name: "Nieuwe werkbon", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "Nieuwe werkbon", exact: true });
    await wizard.getByLabel("Klant", { exact: true }).selectOption(customerId);
    await wizard.getByLabel("Object", { exact: true }).selectOption(objectId);
    await next(page);
    await wizard.getByLabel("Titel", { exact: true }).fill(title);
    await wizard.getByLabel("Dienstcategorie", { exact: true }).fill("Onderhoud");
    await wizard.getByLabel("Taak toevoegen", { exact: true }).selectOption(taskId);
    await wizard.getByLabel("Hoeveelheid (task)", { exact: true }).fill("6");
    await next(page, 2);
    const step = wizard.locator(".wo-wizard-step:not([hidden])");
    await expect(step.locator("input,select,textarea")).toHaveCount(2);
    await next(page);
    await expect(step.getByLabel("Gewenste dag", { exact: true })).toBeVisible();
    await step.getByLabel("Gewenste dag", { exact: true }).fill(day);
    await next(page);
    await expect(step.getByLabel("Gewenst tijdsvenster", { exact: true })).toBeVisible();
    await step.getByLabel("Gewenst tijdsvenster", { exact: true }).selectOption("08:00");
    await expect(step).toContainText("180 arbeidsminuten (3 uur)");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 933 });
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(wizard.getByRole("button", { name: "Volgende", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`arrival-window-${width}.png`), animations: "disabled" });
    }
    await next(page);
    await wizard.getByRole("button", { name: "Vorige", exact: true }).click();
    await expect(step.getByLabel("Gewenste dag", { exact: true })).toHaveValue(day);
    await expect(step.getByLabel("Gewenst tijdsvenster", { exact: true })).toHaveValue("08:00");
    await next(page, 2);
    await expect(wizard).toContainText("08:00 – 10:00");
    await wizard.getByRole("button", { name: "Maak werkbon", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/werkbonnen\/[a-f0-9-]+$/);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    const stored = async () => (await db.query("select w.planning_state,w.requested_date::text,w.planner_user_id,w.lead_personnel_id,w.projected_start_at,w.projected_end_at,w.deadline,w.budget_labor_minutes,w.customer_window_kind,s.starts_at,s.ends_at,(select count(*)::int from public.work_order_assignments a where a.work_order_id=w.id) crew,(select sum(t.duration_minutes*t.quantity)::int from public.work_order_tasks t where t.work_order_id=w.id) task_minutes from public.work_orders w join public.appointment_slots s on s.id=w.appointment_slot_id where w.tenant_id=$1 and w.id=$2", [tenant, id])).rows[0];
    const first = await stored();
    expect(first).toMatchObject({ planning_state: "unassigned", requested_date: day, planner_user_id: null, lead_personnel_id: null, projected_start_at: null, projected_end_at: null, deadline: null, budget_labor_minutes: 180, customer_window_kind: "arrival", crew: 0, task_minutes: 180 });
    expect(first.starts_at.toISOString()).toBe(`${day}T06:00:00.000Z`);
    expect(first.ends_at.toISOString()).toBe(`${day}T08:00:00.000Z`);
    await page.getByRole("button", { name: "Bewerk", exact: true }).click();
    await next(page, 3);
    const edit = page.getByRole("dialog");
    await edit.getByLabel("Gewenste dag", { exact: true }).fill("2033-12-05");
    await edit.getByLabel("Gewenst tijdsvenster", { exact: true }).selectOption("14:00");
    await next(page, 2);
    await edit.getByRole("button", { name: "Wijzigingen opslaan", exact: true }).click();
    await expect(edit).toHaveCount(0);
    expect(await stored()).toMatchObject({ ...first, requested_date: "2033-12-05", starts_at: new Date("2033-12-05T13:00:00Z"), ends_at: new Date("2033-12-05T15:00:00Z") });
    await page.setViewportSize({ width: 1440, height: 933 });
    const number = (await db.query("select work_order_number from public.work_orders where id=$1", [id])).rows[0].work_order_number;
    await page.goto("/app/planning?day=2033-12-05");
    await page.getByLabel("Bonnenweergave").selectOption("unassigned");
    await page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: "Plan", exact: true }).click();
    const planning = page.getByRole("dialog");
    await expect(planning).toContainText("180 minuten");
    await planning.getByLabel("Begin", { exact: true }).fill("2033-12-05T14:00");
    await planning.getByLabel("Einde", { exact: true }).fill("2033-12-05T17:00");
    await planning.getByLabel("Robin de Vries", { exact: false }).check();
    await planning.getByRole("button", { name: "Planning opslaan", exact: true }).click();
    await expect(planning).toHaveCount(0);
    expect(await stored()).toMatchObject({ crew: 1, budget_labor_minutes: 180, task_minutes: 180, customer_window_kind: "arrival", projected_start_at: new Date("2033-12-05T13:00:00Z"), projected_end_at: new Date("2033-12-05T16:00:00Z"), starts_at: new Date("2033-12-05T13:00:00Z"), ends_at: new Date("2033-12-05T15:00:00Z") });
  } finally { await cleanup(db, tenant, title); await db.end(); }
});

test("bewerken behoudt bestaande nietstandaard klantafspraak, planner en exacte personeelsinzet", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  const owner = (await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
  const worker = (await db.query("select p.id from public.personnel p join auth.users u on u.id=p.user_id where p.tenant_id=$1 and u.email='field-worker@fieldgrid.test'", [tenant])).rows[0].id;
  const id = randomUUID(), slot = randomUUID(), title = `Fictief behoud planning ${randomUUID().slice(0, 8)}`;
  try {
    await db.query("insert into public.appointment_slots(id,tenant_id,starts_at,ends_at,capacity,booked_count,status) values($1,$2,$3,$4,1,1,'full')", [slot, tenant, `${day}T06:07:00Z`, `${day}T09:07:00Z`]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,created_by,planner_user_id,lead_personnel_id,planning_state,requested_date,deadline,budget_labor_minutes,customer_window_kind,appointment_slot_id,planned_start_at,projected_start_at,planned_end_at,projected_end_at) values($1,$2,$3,$4,$5,$6,'Onderhoud',$7,$7,$8,'final',$9,$9,180,'execution',$10,$11,$11,$12,$12)", [id, tenant, customerId, objectId, `PREF-${id.slice(0, 8)}`, title, owner, worker, day, slot, `${day}T06:07:00Z`, `${day}T09:07:00Z`]);
    await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by) select $1,$2,id,'PREF','Fictieve voorkeurstaak',duration_minutes,6,unit,price_cents,vat_basis_points,$4 from public.task_revisions where tenant_id=$1 and id=$3", [tenant, id, taskId, owner]);
    await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,projected_start_at,planned_end_at,projected_end_at) values($1,$2,$3,$4,$4,$5,$5)", [tenant, id, worker, `${day}T06:31:00Z`, `${day}T08:37:00Z`]);
    const snapshot = async () => (await db.query("select jsonb_build_object('planning',w.planning_state,'planner',w.planner_user_id,'lead',w.lead_personnel_id,'required',w.required_personnel,'deadline',w.deadline,'start',w.projected_start_at,'end',w.projected_end_at,'plannedStart',w.planned_start_at,'plannedEnd',w.planned_end_at,'requested',w.requested_date,'windowKind',w.customer_window_kind,'slot',w.appointment_slot_id,'slotStart',s.starts_at,'slotEnd',s.ends_at,'budget',w.budget_labor_minutes,'assignments',(select jsonb_agg(to_jsonb(a)-'updated_at'-'version' order by id) from public.work_order_assignments a where a.work_order_id=w.id),'tasks',(select jsonb_agg(to_jsonb(t)-'updated_at'-'version' order by id) from public.work_order_tasks t where t.work_order_id=w.id)) as state from public.work_orders w join public.appointment_slots s on s.id=w.appointment_slot_id where w.tenant_id=$1 and w.id=$2", [tenant, id])).rows[0].state;
    const before = await snapshot();
    await authenticateWorkspace(page, "platform-admin@fieldgrid.test", `/app/werkbonnen/${id}`);
    await page.getByRole("button", { name: "Bewerk", exact: true }).click();
    await next(page);
    const wizard = page.getByRole("dialog");
    await wizard.getByLabel("Omschrijving", { exact: true }).fill("Fictieve beschrijving, bestaande planning behouden.");
    await next(page, 2);
    await expect(wizard.getByLabel("Gewenst tijdsvenster", { exact: true })).toHaveValue("existing");
    await expect(wizard).toContainText("Bestaand: 2033-10-05 08:07 – 2033-10-05 11:07");
    await expect(wizard.locator(".wo-wizard-step:not([hidden]) input,.wo-wizard-step:not([hidden]) select")).toHaveCount(2);
    await next(page, 2);
    await wizard.getByRole("button", { name: "Wijzigingen opslaan", exact: true }).click();
    await expect(wizard).toHaveCount(0);
    expect(await snapshot()).toEqual(before);
  } finally {
    await cleanup(db, tenant, title);
    await db.query("delete from public.appointment_slots where tenant_id=$1 and id=$2", [tenant, slot]);
    await db.end();
  }
});
