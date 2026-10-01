import { expect, test, type Page } from "@playwright/test";
import { brandThemeStyle, createBrandPalette } from "../../lib/branding/palette";

const PASSWORD = "Fieldgrid-E2E-2026";
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(", ")})`;


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
  await expect(page.getByLabel("Primaire kleur").last()).toHaveValue("#214e72");
  await expect(page.getByLabel("Secundaire kleur").last()).toHaveValue("#c65d21");
  await expect(page.getByRole("button", { name: "Volledig whitelabel" })).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveScreenshot("platform-branding-1440.png", { fullPage: true });
  await page.getByRole("button", { name: "Communicatie", exact: true }).click();
  await page.getByRole("button", { name: /Templates beheren/ }).click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Factuur verzonden" })).toBeVisible();
  await expect(page.getByTitle("Voorbeeld e-mail")).toBeVisible();
  const emailPreview = page.frameLocator('iframe[title="Voorbeeld e-mail"]');
  await expect(emailPreview.getByRole("heading", { name: /Factuur FACT-2026-00481/ })).toBeVisible();
  const emailHeader = emailPreview.locator(".mail-shell > tbody > tr").nth(1);
  await expect(emailHeader.getByRole("img", { name: "Demo Organisatie" })).toBeVisible();
  await expect(emailHeader.getByText("Demo Organisatie", { exact: true })).toHaveCount(0);
  const emailWebsiteLink = emailPreview.locator(".mail-shell > tbody > tr").last().locator('a[href^="https://"]');
  await expect(emailWebsiteLink).toBeVisible();
  await expect(emailWebsiteLink).not.toHaveText("");
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
  await expect(page.locator(".workspace-brand").getByText("Demo Organisatie", { exact: true })).toHaveCount(0);
  await expect(page.locator(".workspace-sidebar").getByText("Powered by Fieldgrid", { exact: true })).toBeVisible();
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Aanvragen & offertes" }).click();
  const palette = createBrandPalette("#214E72", "#C65D21");
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("background-color", rgb(palette.sidebar));
  await expect(page.locator(".view-aanvragen .page-intro h1")).toHaveCSS("color", rgb(palette.ink));
  await expect(page.locator(".view-aanvragen .primary-button").first()).toHaveCSS("background-color", rgb(palette.action));
  await expect(page).toHaveScreenshot("tenant-themed-request-page-1440.png", { fullPage: true });
});

test("afgeleide kleurenpaletten zijn rustig, consistent en live zichtbaar zonder opslaan", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "platform-admin@fieldgrid.test", "/app");
  const tenantPalette = createBrandPalette("#214E72", "#C65D21");
  const hero = page.locator(".view-overzicht > .page-intro");
  await expect(hero).toHaveCSS("background-image", /radial-gradient.*linear-gradient/);
  expect(await hero.evaluate((element) => getComputedStyle(element, "::after").backgroundImage)).toContain("repeating-linear-gradient");
  expect(await hero.evaluate((element) => getComputedStyle(element, "::before").content)).toBe('""');
  // Exercise the screenshot's blue/turquoise family without changing stored branding.
  const workspace = page.locator(".workspace-shell");
  const previewPalette = createBrandPalette("#315794", "#52B3B7");
  await page.waitForLoadState("networkidle");
  await workspace.evaluate((element, styles) => {
    for (const [name, value] of Object.entries(styles)) (element as HTMLElement).style.setProperty(name, String(value));
  }, brandThemeStyle("#315794", "#52B3B7"));
  await expect.poll(() => workspace.evaluate((element) => getComputedStyle(element).getPropertyValue("--brand-primary").trim())).toBe("#315794");
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("background-color", rgb(previewPalette.sidebar));
  await expect(hero).toHaveCSS("background-color", rgb(previewPalette.heroStart));
  await expect(page.locator(".metric").first()).toHaveCSS("border-color", rgb(previewPalette.border));
  for (const path of ["aanvragen", "taken", "klanten", "objecten", "personeel", "rapporten", "facturen", "instellingen"]) {
    await page.goto(`/app/${path}`);
    await expect(page.locator(".workspace-sidebar")).toHaveCSS("background-color", rgb(tenantPalette.sidebar));
    await expect(page.locator(".page-intro h1")).toHaveCSS("color", rgb(tenantPalette.ink));
  }
  const palettePreview = page.getByRole("region", { name: "Afgeleid kleurenpalet" });
  await expect(palettePreview).toBeVisible();
  await page.getByLabel("Primaire kleur", { exact: true }).fill("#ffffff");
  await page.getByLabel("Secundaire kleur", { exact: true }).fill("#ffff00");
  const draft = createBrandPalette("#ffffff", "#ffff00");
  await expect(palettePreview.getByText(draft.action.toUpperCase(), { exact: true })).toBeVisible();
  await expect(page.locator(".brand-settings-hero")).toHaveCSS("background-color", rgb(draft.heroStart));
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("background-color", rgb(tenantPalette.sidebar));
  await page.reload();
  await expect(page.getByLabel("Primaire kleur", { exact: true })).toHaveValue("#214e72");
  await expect(page.getByLabel("Secundaire kleur", { exact: true })).toHaveValue("#c65d21");

  await page.goto("/platform");
  await page.getByRole("button", { name: /Demo Organisatie/ }).first().click();
  await page.getByRole("button", { name: "Huisstijl", exact: true }).click();
  await page.getByLabel("Primaire kleur").last().fill("#315794");
  await page.getByLabel("Secundaire kleur").last().fill("#52b3b7");
  await expect(page.locator(".fg-preview-sidebar")).toHaveCSS("background-image", new RegExp(rgb(createBrandPalette("#315794", "#52b3b7").sidebar).replace(/[()]/g, "\\$&")));
  await expect(page.locator(".fg-console")).toHaveCSS("--brand-primary", "#222c35");
  await expect(page.getByRole("region", { name: "Afgeleid kleurenpalet" })).toBeVisible();
  await expect(page).toHaveScreenshot("platform-palette-preview-1440.png", { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page).toHaveScreenshot("platform-palette-preview-390.png", { fullPage: true });
});

test("resourcepagina's zijn aparte lijsten en het planbord vult de beschikbare viewport", async ({ page }) => {
  page.on("dialog", dialog=>dialog.accept());
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "platform-admin@fieldgrid.test", "/app/klanten");

  await expect(page.getByRole("heading", { name: "Klanten", exact: true })).toBeVisible();
  await expect(page.getByText("Noordhaven Vastgoed").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Nummer / klant" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Bewerk" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Verwijder" }).first()).toBeVisible();
  await expect(page.getByText("Meer", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Nieuwe klant" }).click();
  await expect(page.getByRole("dialog", { name: "Nieuwe klant" })).toBeVisible();
  await expect(page.getByText("Identiteit", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("customer-wizard-1440.png");
  const customerWizard = page.getByRole("dialog", { name: "Nieuwe klant" });
  await customerWizard.getByLabel("Klantnaam").fill("Acceptatietest klant");
  await customerWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(customerWizard.getByText("Adressen en facturatie")).toBeVisible();
  await customerWizard.getByLabel("Straatnaam").first().fill("Teststraat");
  await customerWizard.getByLabel("Huisnummer",{exact:true}).first().fill("1");
  await customerWizard.getByLabel("Postcode").first().fill("1234 AB");
  await customerWizard.getByLabel("Woonplaats").first().fill("Utrecht");
  await customerWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(customerWizard.getByText("Eerste contactpersoon")).toBeVisible();
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
  await objectWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(objectWizard.getByText("Bij welke klant hoort deze locatie?")).toBeVisible();
  await objectWizard.locator('select[name="customerId"]').selectOption({ label: "Noordhaven Vastgoed" });
  await objectWizard.getByLabel("Objectnaam").fill("Nieuw kantoor");
  await objectWizard.getByRole("button", { name: "Volgende" }).click();
  await objectWizard.getByLabel("Straatnaam").fill("Teststraat");
  await objectWizard.getByLabel("Huisnummer",{exact:true}).fill("1");
  await objectWizard.getByLabel("Postcode").fill("1234 AB");
  await objectWizard.getByLabel("Woonplaats", { exact: true }).fill("Utrecht");
  await objectWizard.getByLabel("Normale bezoekprocedure").fill("Melden bij de receptie.");
  for (let i=0;i<6;i++) await objectWizard.getByRole("button", { name: "Volgende" }).click();
  const summary = objectWizard.locator(".dossier-facts");
  await expect(summary.getByText("Noordhaven Vastgoed", { exact: true })).toBeVisible();
  await expect(summary.getByText("Nieuw kantoor", { exact: true })).toBeVisible();
  await expect(summary.getByText("Teststraat 1, 1234 AB, Utrecht", { exact: true })).toBeVisible();
  await expect(objectWizard.getByText("Controleer het object", { exact: true })).toBeVisible();
  await expect(objectWizard.getByText(/Klantkoppeling verplicht|op de server|binnen deze tenant/)).toHaveCount(0);
  await expect(objectWizard).toHaveScreenshot("object-wizard-review-1440.png");
  for (let i=0;i<6;i++) await objectWizard.getByRole("button", { name: "Vorige" }).click();
  await objectWizard.getByLabel("Huisnummer",{exact:true}).fill("2");
  await objectWizard.getByLabel("Normale bezoekprocedure").fill("");
  for (let i=0;i<6;i++) await objectWizard.getByRole("button", { name: "Volgende" }).click();
  await expect(summary.getByText("Teststraat 2, 1234 AB, Utrecht", { exact: true })).toBeVisible();
  await expect(summary.getByText("Bezoekinstructies", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => objectWizard.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(objectWizard.getByRole("button", { name: "Object aanmaken" })).toBeVisible();
  await objectWizard.getByRole("button", { name: "Sluiten" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

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
  await page.getByLabel("Planningsdag").fill("2030-01-15");
  await expect(page.locator("[data-order-id]")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: /Gegevens vernieuwen/ })).toHaveCount(0);
  await expect(page.getByText("Reistijd berekenen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Werkbon plannen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bestaande planning exact aanpassen", { exact: true })).toHaveCount(0);
  const planboardHeight = await page.locator(".planboard-viewport").evaluate((element) => element.getBoundingClientRect().height);
  expect(planboardHeight).toBeGreaterThan(600);
  await expect(page).toHaveScreenshot("planboard-full-1440.png", { fullPage: true });
});

test("Meer-overlays blijven buiten tabellen zichtbaar op desktop en mobiel", async ({ page }) => {
  await login(page, "platform-admin@fieldgrid.test", "/app/klanten");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["klanten", "objecten", "personeel"]) {
      await page.goto(`/app/${view}`);
      const table = page.locator(".resource-table-panel .table-scroll");
      const trigger = table.getByRole("button", { name: "Meer", exact: true }).last();
      await trigger.scrollIntoViewIfNeeded();
      const scrollHeight = await table.evaluate((element) => element.scrollHeight);
      await trigger.focus();
      await page.keyboard.press("Enter");

      const overlay = page.getByRole("dialog", { name: "Meer informatie en acties" });
      await expect(overlay).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      // Opening the last row must not add vertical scrolling to the table.
      await expect.poll(() => table.evaluate((element) => element.scrollHeight)).toBe(scrollHeight);
      await expect.poll(() => overlay.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const inset = 4;
        return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight
          && [[rect.left + inset, rect.top + inset], [rect.right - inset, rect.bottom - inset]]
            .every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
      })).toBe(true);
      // Additional dossier filters can put the last row near the viewport edge:
      // Radix may correctly flip upwards. Check the portal, not a forced direction.
      expect(await overlay.evaluate(element => Boolean(element.closest(".resource-table-panel")))).toBe(false);

      await page.keyboard.press("Escape");
      await expect(overlay).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(overlay).toBeVisible();
      if (view === "personeel") {
        await overlay.getByRole("button", { name: "Functies, kwalificaties en documenten" }).click();
        await expect(overlay).toBeHidden();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "Functie en kwalificatie" })).toBeVisible();
        await page.getByRole("button", { name: "Sluiten", exact: true }).click();
      } else {
        await page.locator(".page-intro h1").click();
        await expect(overlay).toBeHidden();
      }
    }
  }
});

test("klantdossier opent elf volledige paginaonderdelen en bewaart contacten, notities en private documenten", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width:1440,height:900});
  await login(page,"platform-admin@fieldgrid.test","/app/klanten");
  await page.getByRole("row").filter({hasText:"Noordhaven Vastgoed"}).getByRole("link",{name:"Bekijk",exact:true}).click();
  await expect(page).toHaveURL(/\/app\/klanten\/[a-f0-9-]+/);
  const dossier=page.locator(".customer-dossier");
  const nav=dossier.getByRole("navigation",{name:"Klantdossier"});
  await expect(nav.getByRole("link")).toHaveText(["Overzicht","Klantgegevens","Contactpersonen","Objecten","Contracten & diensten","Afspraken & opdrachten","Offertes & meerwerk","Facturen & betalingen","Kwaliteit & meldingen","Documenten","Communicatie & tijdlijn"]);
  await expect(dossier.getByRole("heading",{name:"Aandacht & opvolging"})).toBeVisible();
  await expect(dossier.locator(".customer-overview-cards")).toHaveScreenshot("customer-dossier-overview-1440.png");
  await nav.getByRole("link",{name:"Klantgegevens",exact:true}).click();
  await expect(dossier.getByText("finance@customer.test",{exact:true})).toBeVisible();
  await expect(dossier.getByText("14 dagen",{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"Contactpersonen",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/tab=contactpersonen/);
  await dossier.getByRole("button",{name:"Contactpersoon toevoegen",exact:true}).click();
  const contact=page.getByRole("dialog",{name:"Contactpersoon toevoegen"});
  const unique=Date.now().toString(36);
  await contact.getByLabel("Naam",{exact:true}).fill(`Contact ${unique}`);
  await contact.getByLabel("E-mail",{exact:true}).fill("contact@customer.test");
  await contact.getByRole("button",{name:"Contact opslaan",exact:true}).click();
  await expect(contact).toBeHidden();
  await expect(dossier.getByText(`Contact ${unique}`,{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"Objecten",exact:true}).click();
  await expect(dossier.getByText("Noordhaven Kantoor",{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"Afspraken & opdrachten",exact:true}).click();
  await expect(dossier.getByText("WB-2030-001",{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"Communicatie & tijdlijn",exact:true}).click();
  await dossier.getByRole("button",{name:"Registratie toevoegen",exact:true}).click();
  const noteDialog=page.getByRole("dialog",{name:"Communicatie of actie vastleggen"});
  const note=`Dossierafspraak ${unique}: aanmelden bij de receptie.`;
  await noteDialog.getByLabel("Zakelijke toelichting").fill(note);
  await noteDialog.getByRole("button",{name:"Registratie opslaan",exact:true}).click();
  await expect(noteDialog).toBeHidden();
  await expect(dossier.getByText(note,{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"Documenten",exact:true}).click();
  await dossier.getByRole("button",{name:"Document uploaden",exact:true}).click();
  const upload=page.getByRole("dialog",{name:"Document uploaden",exact:true});
  const title=`Overeenkomst ${unique}`;
  await upload.getByLabel("Titel",{exact:true}).fill(title);
  await upload.getByLabel("Bestand",{exact:true}).setInputFiles({name:"invalid.pdf",mimeType:"application/pdf",buffer:Buffer.from("<html>not a PDF</html>")});
  await upload.getByRole("button",{name:"Document uploaden",exact:true}).click();
  await expect(upload.getByRole("alert")).toContainText("bestandsinhoud");
  const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.create();pdf.addPage().drawText("FICTITIOUS Fieldgrid customer test");const bytes=Buffer.from(await pdf.save());
  await upload.getByLabel("Bestand",{exact:true}).setInputFiles({name:"overeenkomst.pdf",mimeType:"application/pdf",buffer:bytes});
  await upload.getByRole("button",{name:"Document uploaden",exact:true}).click();
  await expect(upload).toBeHidden();
  const row=dossier.getByRole("row").filter({hasText:title});
  const downloadPath=await row.getByRole("link",{name:"Download",exact:true}).getAttribute("href");
  const response=await page.request.get(downloadPath!);expect(response.status()).toBe(200);expect(await response.body()).toEqual(bytes);
  await page.reload();await expect(row).toBeVisible();await expect(page).toHaveURL(/tab=documenten/);
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:844});
    for(const tab of ["overzicht","contactpersonen","objecten","afspraken","communicatie","documenten"]){
      await dossier.getByLabel("Onderdeel",{exact:true}).selectOption(tab);
      await expect(page).toHaveURL(new RegExp("tab="+tab));
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844});await dossier.getByLabel("Onderdeel",{exact:true}).selectOption("overzicht");await expect(dossier.getByRole("heading",{name:"Aandacht & opvolging"})).toBeVisible();
  await expect(dossier.locator(".customer-overview-cards")).toHaveScreenshot("customer-dossier-overview-390.png",{stylePath:"tests/e2e/dossier-screenshot.css"});
  const staffContext=await browser.newContext({baseURL:"http://127.0.0.1:3000"});
  try{const staff=await staffContext.newPage();await login(staff,"field-worker@fieldgrid.test","/staff");expect((await staffContext.request.get(downloadPath!)).status()).toBe(404);}finally{await staffContext.close();}
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


test("Klant 360 wizard bewaart een particulier zonder bedrijfsnummers en behoudt lijstcontext",async({page})=>{
  await login(page,"platform-admin@fieldgrid.test","/app/klanten");
  await page.getByRole("button",{name:"Nieuwe klant",exact:true}).click();
  const wizard=page.getByRole("dialog",{name:"Nieuwe klant",exact:true});
  const name=`FICTITIOUS Klantwizard ${Date.now()}`;
  await wizard.locator('select[name="type"]').selectOption("private");
  await wizard.getByLabel("Klantnaam",{exact:true}).fill(name);
  await expect(wizard.getByLabel("KvK-nummer (optioneel)")).toBeHidden();
  await wizard.getByRole("button",{name:"Volgende",exact:true}).click();
  await expect(wizard.getByLabel("Betaaltermijn (dagen)")).toHaveValue("14");
  await wizard.getByLabel("Factuurmail",{exact:true}).fill("fixture@customer360.test");
  await wizard.getByRole("button",{name:"Volgende",exact:true}).click();
  await wizard.getByLabel("Naam contactpersoon",{exact:true}).fill("FICTITIOUS Contact wizard");
  await wizard.getByLabel("E-mail contactpersoon",{exact:true}).fill("contact@customer360.test");
  await wizard.getByRole("button",{name:"Volgende",exact:true}).click();
  await wizard.locator('select[name="status"]').selectOption("active");
  await wizard.getByRole("button",{name:"Volgende",exact:true}).click();
  await expect(wizard.locator(".customer-summary")).toContainText(name);
  await wizard.getByRole("button",{name:"Klant aanmaken",exact:true}).click();
  await expect(wizard).toBeHidden();
  await expect(page).toHaveURL(/\/app\/klanten\/[a-f0-9-]{36}/);
  await page.reload();await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  const customerPath=new URL(page.url()).pathname;
  await page.goto("/app/klanten?q="+encodeURIComponent(name)+"&sort=number");
  const row=page.getByRole("row").filter({hasText:name});
  await expect(row).toHaveCount(1);
  await row.getByRole("link",{name:"Bekijk",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(customerPath));
  await page.getByRole("link",{name:"Terug naar klanten"}).click();
  await expect(page).toHaveURL(/sort=number/);
  await expect(page.getByRole("row").filter({hasText:name})).toHaveCount(1);
});
