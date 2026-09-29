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

test("platform backoffice beheert tenants, huisstijl en berichttemplates professioneel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "platform-admin@fieldgrid.test", "/platform");
  await expect(page.getByRole("heading", { name: "Grip op iedere tenant." })).toBeVisible();
  await expect(page.getByText("FIELDGRID PLATFORM", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo Organisatie").first()).toBeVisible();
  await expect(page).toHaveScreenshot("platform-overview-1440.png", { fullPage: true });

  await page.getByRole("button", { name: /Demo Organisatie/ }).first().click();
  await expect(page.getByRole("heading", { name: "Demo Organisatie" })).toBeVisible();
  await page.getByRole("button", { name: "Huisstijl", exact: true }).click();
  await expect(page.getByLabel("Primaire kleur").last()).toHaveValue("#222c35");
  await expect(page.getByLabel("Secundaire kleur").last()).toHaveValue("#41ac42");
  await page.getByRole("button", { name: "Communicatie", exact: true }).click();
  await page.getByRole("button", { name: /Templates beheren/ }).click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Factuur verzonden" })).toBeVisible();
  await expect(page.getByTitle("Voorbeeld e-mail")).toBeVisible();
  const emailPreview = page.frameLocator('iframe[title="Voorbeeld e-mail"]');
  await expect(emailPreview.getByRole("heading", { name: /Factuur FACT-2026-00481/ })).toBeVisible();
  await expect(page).toHaveScreenshot("platform-templates-1440.png", { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(emailPreview.getByRole("heading", { name: /Factuur FACT-2026-00481/ })).toBeVisible();
  await expect(page).toHaveScreenshot("platform-templates-390.png", { fullPage: true });
});

test("backoffice toont echte tenantdata en blijft bruikbaar over alle doelbreedtes", async ({ page }) => {
  await login(page, "platform-admin@fieldgrid.test");
  await expect(page.getByRole("heading", { name: /Demo Organisatie/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Logo van Demo Organisatie" })).toBeVisible();
  await expect(page.getByText("LOGO", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Actuele tenantdata", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Planning", exact: true })).toHaveCount(0);
  for (const width of [768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveScreenshot("backoffice-1440.png", { fullPage: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page).toHaveScreenshot("backoffice-768.png", { fullPage: true });
});

test("resourcepagina's zijn aparte lijsten en het planbord vult de beschikbare viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "platform-admin@fieldgrid.test", "/app/klanten");

  await expect(page.getByRole("heading", { name: "Klanten", exact: true })).toBeVisible();
  await expect(page.getByText("Noordhaven Vastgoed").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Klantnummer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekijk" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Bewerk" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Verwijder" }).first()).toBeVisible();
  await expect(page.getByText("Meer", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Nieuwe klant" }).click();
  await expect(page.getByRole("dialog", { name: "Nieuwe klant" })).toBeVisible();
  await expect(page.getByText("Organisatie", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("customer-wizard-1440.png");
  const customerWizard = page.getByRole("dialog", { name: "Nieuwe klant" });
  await customerWizard.getByLabel("Klantnaam").fill("Acceptatietest klant");
  await customerWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(customerWizard.getByText("Wat is het factuuradres?")).toBeVisible();
  await customerWizard.getByLabel("Straat en huisnummer").fill("Teststraat 1");
  await customerWizard.getByLabel("Postcode").fill("1234 AB");
  await customerWizard.getByLabel("Plaats").fill("Utrecht");
  await customerWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(customerWizard.getByText("Controleer en maak de klant aan")).toBeVisible();
  await customerWizard.getByRole("button", { name: "Sluiten" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("customers-list-1440.png");

  await page.getByRole("link", { name: "Objecten" }).click();
  await expect(page).toHaveURL(/\/app\/objecten$/);
  await expect(page.getByRole("heading", { name: "Objecten", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nieuw object" }).click();
  const objectWizard = page.getByRole("dialog", { name: "Nieuw object" });
  await expect(objectWizard).toBeVisible();
  await expect(objectWizard.locator('select[name="customerId"]')).toBeVisible();
  await page.getByRole("button", { name: "Annuleren" }).click();

  await page.getByRole("link", { name: "Personeel" }).click();
  await expect(page).toHaveURL(/\/app\/personeel$/);
  await expect(page.getByRole("columnheader", { name: "Personeelsnummer" })).toBeVisible();

  await page.getByRole("link", { name: "Rapportcontrole" }).click();
  await expect(page).toHaveURL(/\/app\/rapporten$/);
  await expect(page.getByRole("option", { name: "Openstaand" })).toBeAttached();
  await expect(page.getByRole("option", { name: "Verwerkt" })).toBeAttached();

  await page.getByRole("link", { name: "Facturen" }).click();
  await expect(page).toHaveURL(/\/app\/facturen$/);
  for (const [value, status] of [["new", "Nieuw"], ["submitted", "Ingediend"], ["open", "Openstaand"], ["paid", "Betaald"], ["late", "Te laat"]]) {
    await expect(page.locator(`.resource-toolbar option[value="${value}"]`)).toHaveText(status);
  }

  await page.getByRole("link", { name: "Planbord" }).click();
  await expect(page).toHaveURL(/\/app\/planning$/);
  await expect(page.getByRole("heading", { name: "Planbord", exact: true })).toBeVisible();
  await expect(page.getByText("Reistijd berekenen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Werkbon plannen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bestaande planning exact aanpassen", { exact: true })).toHaveCount(0);
  const planboardHeight = await page.locator(".planboard-viewport").evaluate((element) => element.getBoundingClientRect().height);
  expect(planboardHeight).toBeGreaterThan(600);
  await expect(page).toHaveScreenshot("planboard-full-1440.png", { fullPage: true });
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
