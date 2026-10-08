import { expect, test, type Page } from "@playwright/test";
import { authenticateWorkspace } from "./login-auth";

async function withinViewport(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("dashboardlijsten houden hun header, tabbladen en bediening binnen desktop en mobiel", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["klanten", "objecten", "werkbonnen", "taken", "aanvragen", "nieuws", "instellingen", "opvolging"]) {
      await page.goto(`/app/${route}`);
      await expect(page.locator(".unified-page-heading h1").first()).toBeVisible();
      await withinViewport(page);
      const heading = page.locator(".unified-page-heading").first();
      const positions = await heading.evaluate(el => ({ title: el.querySelector("h1")!.getBoundingClientRect().top, subtitle: el.querySelector(".eyebrow")!.getBoundingClientRect().bottom }));
      expect(positions.title, `Subtitle sits above title on ${route}`).toBeGreaterThanOrEqual(positions.subtitle);
      if (route === "taken") await expect(page.getByText("Taken laden…", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll("/", "-")}-${width}.png`), fullPage: true });
      const tables = page.locator(".resource-table-panel:visible");
      if (width === 1440 && await tables.count()) {
        const alignment = await tables.first().evaluate(panel => {
          const table = panel.querySelector("table");
          const scroller = table?.closest(".table-scroll");
          if (!table || !scroller || scroller.scrollWidth > scroller.clientWidth) return true;
          return Math.abs(table.getBoundingClientRect().right - panel.getBoundingClientRect().right) <= 2;
        });
        expect(alignment, `Full-width header on ${route}`).toBe(true);
      }
      const tabs = page.locator(".content-tab-list:visible, .fg-tabbed-content > .nt-tabs:visible, .fg-tabbed-content > .ticket-views:visible");
      if (await tabs.count()) {
        await expect(tabs.first()).toBeVisible();
        expect(await tabs.first().evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1)).toBe(true);
      }
    }
  }
});

test("slim zoeken begint bij drie tekens en opent gegroepeerde resultaten met het toetsenbord", async ({ page }) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test");
  const searches: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/search") searches.push(request.postData() ?? ""); });
  const search = page.getByRole("combobox", { name: "Zoek in je organisatie" });
  await search.fill("No");
  await page.waitForTimeout(400);
  expect(searches).toHaveLength(0);
  await search.fill("Noordhaven");
  const results = page.getByRole("listbox", { name: "Zoekresultaten" });
  await expect(results.getByRole("group", { name: "Klanten", exact: true })).toBeVisible();
  await expect(results.getByRole("group", { name: "Objecten", exact: true })).toBeVisible();
  await expect(results.getByRole("group", { name: "Klanten", exact: true }).getByRole("option", { name: /Noordhaven Vastgoed/ })).toBeVisible();
  await search.press("ArrowDown");
  await expect(results.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/app\/klanten\?record=/);
  await expect(page.getByRole("heading", { name: "Noordhaven Vastgoed", exact: true }).first()).toBeVisible();
});

test("account en notificaties hebben dezelfde maat en thema als de zoekbalk", async ({ page }) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test");
  const account = page.locator(".workspace-topbar .shell-account-button");
  const bell = page.locator(".workspace-topbar .nt-bell-button");
  await expect(account).toBeVisible();
  await expect(bell).toBeVisible();
  const controls = await page.locator(".workspace-topbar .shell-search-field, .workspace-topbar .shell-account-button, .workspace-topbar .nt-bell-button").evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node);
    return { height: node.getBoundingClientRect().height, border: css.borderTopWidth, color: css.borderTopColor };
  }));
  expect(controls).toHaveLength(3);
  for (const control of controls) expect(control).toEqual(controls[0]);
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Mijn profiel", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Mijn profiel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Eigenaar");
});
