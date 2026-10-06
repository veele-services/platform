import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { authenticateWorkspace } from "./login-auth";
import { requireLocalDatabaseUrl } from "./local-target";

const prefix = `Paging-${randomUUID().slice(0,8)}`;
let db: Client, tenant: string;
test.beforeAll(async () => {
  db = new Client({ connectionString: requireLocalDatabaseUrl().href }); await db.connect();
  tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  for (let index=0;index<35;index++) await db.query("insert into public.customers(tenant_id,customer_number,name) values($1,$2,$2)",[tenant,`${prefix}-${String(index).padStart(3,"0")}`]);
});
test.afterAll(async () => { if (db) { try { await db.query("delete from public.customers where tenant_id=$1 and customer_number like $2",[tenant,`${prefix}-%`]); } finally { await db.end(); } } });

test("tenant lists share title origins, header filters and pagination below their surfaces", async ({ page }, info) => {
  test.setTimeout(150000); await page.setViewportSize({width:1440,height:1000}); await authenticateWorkspace(page,"platform-admin@fieldgrid.test","/app");
  await expect(page.locator("[data-account-guides-ready=true]")).toBeAttached();
  await expect(page.locator(".backoffice-content:visible .unified-page-heading:visible").first()).toBeVisible();
  const initialGuide=page.locator(".backoffice-content:visible > .fg-guide:visible");if(await initialGuide.count()){await initialGuide.getByRole("button").click();await expect(initialGuide).toHaveCount(0);}
  const reference = await page.locator(".backoffice-content:visible>.unified-page-heading").boundingBox(); expect(reference).not.toBeNull();
  const routes=["aanvragen","werkbonnen","taken","klanten","objecten","personeel","rapporten","facturen","nieuws","opvolging","notificaties","instellingen","planning"];
  for (const route of routes) {
    await page.goto(`/app/${route}`);
    await expect(page.locator("[data-account-guides-ready=true]")).toBeAttached();
    await expect(page.locator(".backoffice-content:visible .unified-page-heading:visible").first()).toBeVisible();
    const pageGuide=page.locator(".backoffice-content:visible > .fg-guide:visible");if(await pageGuide.count()){await expect(pageGuide).toBeVisible();await pageGuide.getByRole("button").click();await expect(pageGuide).toHaveCount(0);}
    const heading=page.locator(".backoffice-content:visible .unified-page-heading:visible").first();await expect(heading).toBeVisible();
    const bounds=await heading.boundingBox();expect(Math.abs(bounds!.x-reference!.x),route).toBeLessThanOrEqual(1);expect(Math.abs(bounds!.y-reference!.y),route).toBeLessThanOrEqual(1);
    if (!["planning","instellingen"].includes(route)) {
      const pagination=page.locator(".list-pagination:visible").first();await expect(pagination,route).toBeVisible();
      await expect(page.locator(".panel .list-pagination,.fg-section-body .list-pagination"),route).toHaveCount(0);
      await expect(pagination.getByRole("button",{name:"Vorige pagina",exact:true})).toBeVisible();await expect(pagination.getByRole("button",{name:"Volgende pagina",exact:true})).toBeVisible();
      await expect(pagination.getByLabel("Aantal per pagina")).toBeVisible();
    }
    if (["aanvragen","werkbonnen","klanten","objecten","personeel","rapporten","facturen","nieuws","notificaties"].includes(route)) await expect(heading.getByRole("button",{name:/Zoeken en filteren/})).toBeVisible();
    await page.screenshot({path:info.outputPath(`list-${route}-1440.png`),animations:"disabled"});
  }
  for (const width of [390,320]) { await page.setViewportSize({width,height:900});await page.goto("/app/werkbonnen");await expect(page.getByLabel("Werkweergave")).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`list-workorders-${width}.png`),animations:"disabled"}); }
});

test("selected list size requests actual server pages and survives a fresh route", async ({page})=>{
 await authenticateWorkspace(page,"platform-admin@fieldgrid.test",`/app/klanten?q=${prefix}&pageSize=10`);
 const pagination=page.getByRole("navigation",{name:"Paginatie klanten"});
 await expect(pagination).toContainText("35 klanten · pagina 1 van 4");await expect(page.locator(".customer-table tbody tr")).toHaveCount(10);
 await pagination.getByRole("button",{name:"Volgende pagina",exact:true}).click();await expect(pagination).toContainText("pagina 2 van 4");await expect(page.locator(".customer-table tbody tr")).toHaveCount(10);
 await pagination.getByLabel("Aantal per pagina").selectOption("50");await expect(pagination).toContainText("pagina 1 van 1");await expect(page.locator(".customer-table tbody tr")).toHaveCount(35);
 await page.goto(`/app/klanten?q=${prefix}`);await expect(pagination.getByLabel("Aantal per pagina")).toHaveValue("50");await expect(page.locator(".customer-table tbody tr")).toHaveCount(35);
 await page.getByRole("button",{name:/Zoeken en filteren/}).click();await page.getByPlaceholder("Naam, nummer, contact of plaats…").fill(`Missing-${prefix}`);await page.getByRole("button",{name:"Filters toepassen"}).click();await expect(pagination).toContainText("0 klanten · pagina 1 van 1");await expect(pagination.getByRole("button",{name:"Vorige pagina"})).toBeDisabled();await expect(pagination.getByRole("button",{name:"Volgende pagina"})).toBeDisabled();
});
