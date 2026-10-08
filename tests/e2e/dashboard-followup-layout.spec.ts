import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { authenticateWorkspace } from "./login-auth";
import { requireLocalDatabaseUrl } from "./local-target";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(60_000);

async function expectJoined(page: Page, tab: Locator, card: Locator) {
  await expect(card).toBeVisible();
  await expect.poll(async () => {
    const tabBox = await tab.boundingBox(), cardBox = await card.boundingBox();
    return Boolean(tabBox && cardBox && Math.abs(tabBox.y + tabBox.height - cardBox.y) <= 2);
  }).toBe(true);
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe("0px");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("Meerwerk en Templates sluiten zonder dubbele subtitel direct aan op hun tabs", async ({ page }, info) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/taken");
  await expect(page.getByRole("heading", { name: "Taken & tarieven", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Meerwerk", "Templates"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
      await expectJoined(page, tab, page.getByRole("region", { name, exact: true }));
      if (name === "Meerwerk") await expect(page.getByLabel("Werkbon", { exact: true })).toBeVisible();
      else await expect(page.getByRole("link", { name: "Werkbon- en checklisttemplates openen", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`catalogue-${name.toLowerCase()}-${width}.png`), animations: "disabled" });
    }
  }
});

test("alle instellingentabs hebben overzichtelijke groepen en een aangesloten kaart", async ({ page }, info) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/instellingen");
  const tabList = page.getByRole("tablist", { name: "Organisatie-instellingen", exact: true });
  const tabs = [
    ["Huisstijl & afzender", "Huisstijl"], ["Reizen", "Reisinstellingen"],
    ["Personeelsnummering", "Personeelsnummering"], ["Ondertekening", "Ondertekening van werkrapporten"],
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, region] of tabs) {
      const tab = tabList.getByRole("tab", { name, exact: true });
      await tab.click();
      const card = page.getByRole("region", { name: region, exact: true });
      if (name === "Reizen") await expect(card.getByRole("group", { name: "Aankomstmarges", exact: true })).toBeVisible();
      if (name === "Ondertekening") await expect(card.getByRole("group", { name: "Ondertekening", exact: true })).toBeVisible();
      await expectJoined(page, tab, card);
      await expect.poll(() => card.evaluate(element => parseFloat(getComputedStyle(element).paddingTop))).toBeGreaterThanOrEqual(20);
      await page.screenshot({ path: info.outputPath(`settings-${name.toLowerCase().replaceAll(" ", "-")}-${width}.png`), animations: "disabled" });
    }
    await tabList.getByRole("tab", { name: "Ondertekening", exact: true }).focus();
    await page.keyboard.press("Home");
    await expect(tabList.getByRole("tab", { name: "Huisstijl & afzender", exact: true })).toBeFocused();
    await expect(tabList.getByRole("tab", { name: "Huisstijl & afzender", exact: true })).toHaveAttribute("aria-selected", "true");
  }
});

test("bevoegdhedenkaart blijft zonder afgeronde tussenruimte aangesloten op de notificatietabs", async ({ page }) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/notificaties?tab=permissions");
  await expect(page.getByRole("heading", { name: "Notificatiebevoegdheden", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tab = page.getByRole("link", { name: "Bevoegdheden", exact: true });
    await tab.scrollIntoViewIfNeeded();
    await expectJoined(page, tab, page.locator(".nt-permissions"));
    await expect(page.getByRole("button", { name: "Notificatierecht toekennen", exact: true })).toBeVisible();
  }
});

test("personeelsacties hebben telling en werkende paginatie onder de container", async ({ page }) => {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const personnelId = randomUUID(), marker = `Actie ${personnelId.slice(0, 8)}`;
  let tenant = "";
  try {
    tenant = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
    await db.query("insert into public.personnel(id,tenant_id,full_name,employee_number) values($1,$2,$3,$4)", [personnelId, tenant, marker, `LAYOUT-${personnelId.slice(0, 8)}`]);
    for (let index = 0; index < 26; index++) await db.query("insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,due_on,dossier_managed,dossier_status,dossier_data) values($1,$2,$3,'task',$4,'2031-03-04',true,'open',$5)", [randomUUID(), tenant, personnelId, `${marker} ${index + 1}`, { title: `${marker} ${index + 1}`, dueOn: "2031-03-04" }]);
    await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/personeel/acties");
    await page.getByRole("button", { name: "Zoeken en filteren", exact: true }).click();
    await page.getByLabel("Zoeken", { exact: true }).fill(marker);
    await page.keyboard.press("Escape");
    const pagination = page.getByRole("navigation", { name: "Paginatie acties", exact: true });
    await expect(pagination).toContainText("26 acties · pagina 1 van 2");
    await expect(page.locator(".resource-table tbody tr")).toHaveCount(25);
    await pagination.getByRole("button", { name: "Volgende pagina", exact: true }).click();
    await expect(page.locator(".resource-table tbody tr")).toHaveCount(1);
    await pagination.getByLabel("Aantal per pagina", { exact: true }).selectOption("10");
    await expect(pagination).toContainText("26 acties · pagina 1 van 3");
    await pagination.getByLabel("Ga naar pagina", { exact: true }).selectOption("3");
    await expect(page.locator(".resource-table tbody tr")).toHaveCount(6);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const cardBox = (await page.locator(".dossier-card").boundingBox())!, paginationBox = (await pagination.boundingBox())!;
      expect(paginationBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {
    if (tenant) {
      for (const table of ["personnel_dossier_deliveries", "personnel_dossier_history", "personnel_dossier_items"] as const) await db.query(`delete from public.${table} where personnel_id=$1 and tenant_id=$2`, [personnelId, tenant]);
      await db.query("delete from public.personnel where id=$1 and tenant_id=$2", [personnelId, tenant]);
    }
    await db.end();
  }
});
