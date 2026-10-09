import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(90_000);

test("werkbon vrijgeven via planbord, lijst en dossier publiceert dezelfde versievaste planning", async ({ page, browser }, info) => {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href }), day = "2034-11-08", ids: string[] = [];
  const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000", locale: "nl-NL" });
  const staff = await staffContext.newPage();
  await db.connect();
  try {
    const tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
    for (const [index, entry] of ["planbord", "lijst", "dossier"].entries()) {
      const id = randomUUID(), number = `RELEASE-${id.slice(0, 8)}`; ids.push(id);
      const start = `${day}T${String(9 + index).padStart(2, "0")}:00:00Z`, end = `${day}T${String(9 + index).padStart(2, "0")}:30:00Z`;
      await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,planning_state,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) select $1,tenant_id,customer_id,object_id,$2,$2,discipline,'planned','tentative',$3,$4,$3,$4,created_by from public.work_orders where id='e6000000-0000-4000-8000-000000000001'", [id, number, start, end]);
      await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,'e1000000-0000-4000-8000-000000000001','planned',$3,$4,$3,$4)", [tenant, id, start, end]);
      await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,unit,quantity,unit_price_cents,vat_basis_points) select tenant_id,$1,task_revision_id,task_code,task_name,duration_minutes,unit,quantity,unit_price_cents,vat_basis_points from public.work_order_tasks where id='e7000000-0000-4000-8000-000000000001'", [id]);
      await authenticateWorkspace(page, "platform-admin@fieldgrid.test", entry === "planbord" ? `/app/planning?day=${day}` : entry === "lijst" ? `/app/werkbonnen?q=${number}` : `/app/werkbonnen/${id}`);
      await page.setViewportSize({ width: entry === "lijst" ? 390 : 1440, height: 900 });
      if (entry === "planbord") {
        await page.locator(`.pb-bon[data-order-id="${id}"]`).getByRole("button", { name: `Acties voor werkbon ${number}`, exact: true }).click();
      } else if (entry === "lijst") {
        await page.getByRole("button", { name: `Meer acties voor ${number}`, exact: true }).click();
      }
      await page.getByRole("button", { name: "Werkbon vrijgeven", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Werkbon vrijgeven", exact: true });
      await expect(dialog).toContainText(number);
      await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await dialog.evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      await page.screenshot({ path: info.outputPath(`release-${entry}.png`) });
      await dialog.getByRole("button", { name: "Werkbon vrijgeven", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await db.query("select status from public.work_orders where id=$1", [id])).rows[0].status).toBe("released");
      expect((await db.query("select planning_state,published_at is not null as published from public.work_orders where id=$1", [id])).rows[0]).toMatchObject({ planning_state: "final", published: true });
      expect((await db.query("select count(*) from public.dispatches where work_order_id=$1 and revoked_at is null", [id])).rows[0].count).toBe("1");
      if (entry === "planbord") {
        await expect(page.locator(`.pb-bon[data-order-id="${id}"]`)).toHaveAttribute("data-status", "released");
        await page.locator(`.pb-bon[data-order-id="${id}"]`).getByRole("button", { name: `Acties voor werkbon ${number}`, exact: true }).click();
        await expect(page.getByRole("button", { name: "Werkbon vrijgeven", exact: true })).toHaveCount(0);
      }
      // Keep the two actors in separate sessions, as in actual use. Logging the
      // same staff account in repeatedly also triggers the unrelated PWA offer.
      if (index === 0) await authenticateWorkspace(staff, "field-worker@fieldgrid.test", `/staff?workOrder=${id}`);
      else await staff.goto(`/staff?workOrder=${id}`);
      await expect(staff.getByRole("dialog", { name: `Werkbon ${number}`, exact: true })).toBeVisible();
    }
  } finally {
    if (ids.length) {
      await db.query("delete from public.audit_events where entity_id=any($1::uuid[])", [ids]);
      await db.query("delete from private.work_order_commands where result->>'id'=any($1::text[])", [ids]);
      await db.query("delete from public.work_orders where id=any($1::uuid[])", [ids]);
    }
    await db.end();
    await staffContext.close();
  }
});
