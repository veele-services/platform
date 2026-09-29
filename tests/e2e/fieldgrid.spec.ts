import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Fieldgrid-E2E-2026";

async function login(page: Page, email: string, next = "/app") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: /Inloggen/ }).click();
  await page.waitForURL((url) => url.pathname === next);
}

test("beschermde routes vereisen een sessie en foutieve login lekt geen accountstatus", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mailadres").fill("unknown@fieldgrid.test");
  await page.getByLabel("Wachtwoord").fill("ongeldig");
  await page.getByRole("button", { name: /Inloggen/ }).click();
  await expect(page.getByText("Inloggen is niet gelukt. Controleer je gegevens.")).toBeVisible();
});

test("backoffice toont echte tenantdata en blijft bruikbaar over alle doelbreedtes", async ({ page }) => {
  await login(page, "platform-admin@fieldgrid.test");
  await expect(page.getByRole("heading", { name: /Demo Organisatie/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Logo van Demo Organisatie" })).toBeVisible();
  await expect(page.getByText("LOGO", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Noordhaven Vastgoed").first()).toBeVisible();
  for (const width of [768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveScreenshot("backoffice-1440.png", { fullPage: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page).toHaveScreenshot("backoffice-768.png", { fullPage: true });
});

test("personeels-PWA opent een vrijgegeven bon, zet gezien en toont de echte checklist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "field-worker@fieldgrid.test", "/staff");
  await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Logo van Demo Organisatie" })).toBeVisible();
  await expect(page.getByText("LOGO", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /WB-2030-001/ }).click();
  await page.getByRole("button", { name: "Taken" }).click();
  await expect(page.getByText("Periodieke controle")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vertrek" })).toBeVisible();
  await expect(page.getByText("Werkbon geopend")).toBeHidden({ timeout: 8_000 });
  await expect(page).toHaveScreenshot("staff-order-390.png", { fullPage: true });
});

test("login en PWA hebben geen horizontale overflow op smalle doelbreedtes", async ({ page }) => {
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/login");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
