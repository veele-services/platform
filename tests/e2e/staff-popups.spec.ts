import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { authenticateStaff } from "./staff-auth";
import { Client } from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import { ticketModule } from "./staff-modules";

test.use({ reducedMotion: "reduce" });

async function inspectDialog(page: Page, dialog: Locator, info: TestInfo, name: string) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }).toBe(true);
  await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const input = dialog.locator('input:not([type="checkbox"]), select, textarea').first();
  if (await input.count()) await expect(input).toHaveCSS("font-size", viewport.width <= 600 ? "16px" : "12.8px");
  const scroll = dialog.locator(".staff-dialog-scroll").first();
  if (await scroll.count()) await expect(scroll).toHaveCSS("padding-left", viewport.width <= 600 ? "20px" : "28px");
  const footer = dialog.locator(".ps-modal-footer, [data-slot=dialog-footer], .ticket-form-footer").last();
  if (await footer.count()) {
    const body = dialog.locator(".ps-modal-body, .staff-dialog-scroll, .ticket-dialog-body, form").first();
    if (await body.count()) await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(footer).toBeVisible();
    // Opening animations must not compare the footer's final frame with an
    // earlier, still-scaled dialog frame. Read both in the same layout pass.
    await expect.poll(() => footer.evaluate(element => {
      const dialog = element.closest('[role="dialog"]')!;
      const outer = dialog.getBoundingClientRect(), inner = element.getBoundingClientRect();
      return inner.top >= outer.top && inner.bottom <= outer.bottom + 1;
    })).toBe(true);
  }
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
}

test("werkbonvensters blijven binnen het scherm en bewaren terugkeer naar de bon", async ({ page }, info) => {
  test.setTimeout(90_000);
  await authenticateStaff(page, "field-worker@fieldgrid.test");
  await page.getByRole("button", { name: /WB-2030-001/ }).click();
  const sheet = page.getByRole("dialog", { name: "Werkbon WB-2030-001", exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await inspectDialog(page, sheet, info, `work-order-${width}`);
    for (const [trigger, title] of [["Route bekijken", "Route naar locatie"], ["Beveiligde objecttoegang", "Beveiligde objecttoegang"]]) {
      await sheet.getByRole("button", { name: trigger, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await inspectDialog(page, dialog, info, `${trigger}-${width}`);
      await dialog.getByRole("button", { name: "Terug naar werkbon", exact: true }).click();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("button", { name: trigger, exact: true })).toBeFocused();
    }
    await sheet.getByRole("button", { name: "Werkbon terugmelden", exact: true }).click();
    const returnDialog = page.getByRole("dialog", { name: "Werkbon terugmelden", exact: true });
    await inspectDialog(page, returnDialog, info, `return-${width}`);
    await returnDialog.getByRole("button", { name: "Annuleren", exact: true }).click();
    await sheet.getByRole("tab", { name: "Werkzaamheden", exact: true }).click();
    const extraHelp=sheet.locator(".staff-panel").filter({has:page.getByRole("heading",{name:"Meerwerk",exact:true})}).getByRole("button",{name:"Informatie over meerwerk",exact:true});
    await extraHelp.click();
    const help=page.getByRole("note").filter({hasText:"Extra werkzaamheden"});
    await expect(help).toBeVisible();
    const helpBox=(await help.boundingBox())!;expect(helpBox.x).toBeGreaterThanOrEqual(0);expect(helpBox.x+helpBox.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");await expect(help).toHaveCount(0);
    await expect(sheet).toBeVisible();await expect(extraHelp).toBeFocused();
    for (const [trigger, title] of [["Materiaal", "Materiaal toevoegen"], ["Onkosten", "Onkosten toevoegen"]]) {
      await sheet.locator(".staff-panel").filter({has:page.getByRole("heading",{name:"Materiaal & onkosten",exact:true})}).getByRole("button",{name:"Toevoegen",exact:true}).click();
      await page.getByRole("menuitem",{name:trigger,exact:true}).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await inspectDialog(page, dialog, info, `${trigger}-${width}`);
      await dialog.getByRole("button", { name: "Annuleren", exact: true }).click();
    }
    await sheet.getByRole("tab", { name: "Overzicht", exact: true }).click();
  }
  await sheet.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(sheet).toHaveCount(0);
});

test("nieuws, verlof, account en apparaat gebruiken toegankelijke mobiele vensters", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 740 });
  await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=nieuws");
  await page.getByRole("button", { name: /Welkom in Fieldgrid/ }).click();
  const article = page.getByRole("dialog", { name: "Welkom in Fieldgrid", exact: true });
  await inspectDialog(page, article, info, "news-320");
  await page.keyboard.press("Escape");
  await expect(article).toHaveCount(0);
  await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("button", { name: "Meer", exact: true }).click();
  await page.locator(".ps-more-card").filter({ hasText: "Verlof" }).click();
  await page.getByRole("button", { name: "Verlof aanvragen", exact: true }).click();
  const leave = page.getByRole("dialog", { name: "Verlof aanvragen", exact: true });
  await expect(leave).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".ps-topbar-leading .ps-sync")).toHaveClass(/syncing/);
  await expect(page.locator(".ps-topbar-leading .ps-sync")).toHaveClass(/current/);
  await inspectDialog(page, leave, info, "leave-320");
  await leave.getByRole("button", { name: "Annuleren", exact: true }).click();
  await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("button", { name: "Meer", exact: true }).click();
  await page.locator(".ps-more-card").filter({ hasText: "Instellingen" }).click();
  await page.getByRole("navigation", { name: "Instellingenonderdelen" }).getByRole("button", { name: "Meldingen", exact: true }).click();
  await page.getByRole("button", { name: "Apparaat instellen", exact: true }).click();
  const push = page.getByRole("dialog", { name: "Pushmeldingen instellen", exact: true });
  await inspectDialog(page, push, info, "push-320");
  await push.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.getByRole("navigation", { name: "Instellingenonderdelen" }).getByRole("button", { name: "Account & toegang", exact: true }).click();
  await page.getByRole("button", { name: "Loginflow bekijken", exact: true }).click();
  const login = page.getByRole("dialog", { name: "Inloggen met e-mailcode", exact: true });
  await inspectDialog(page, login, info, "account-320");
  await login.getByRole("button", { name: "Sluiten", exact: true }).click();
});

test("ticketinvoer en filterpopovers behouden de eigen engine zonder mobiele overflow", async ({ page }, info) => {
  test.setTimeout(90_000);
  const restore = await ticketModule(true);
  try {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff/meldingen");
  const create = page.getByRole("button", { name: /Nieuwe melding|Nieuw ticket/ });
  await expect(create).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await create.click();
    const dialog = page.getByRole("dialog", { name: "Nieuwe melding", exact: true });
    await inspectDialog(page, dialog, info, `ticket-${width}`);
    await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(create).toBeFocused();
    await page.getByRole("button", { name: /Zoeken en filteren/ }).click();
    const filters = page.locator(".ticket-filter-popover");
    await expect(filters).toBeVisible();
    const box = await filters.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(filters).toHaveCount(0);
  }
  } finally { await restore(); }
});


test("actieve uitvoering toont meerwerk en afrondingscontrole zonder rapport of meerwerk te versturen", async ({ page }, info) => {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const orderId = "e6000000-0000-4000-8000-000000000001";
  const assignmentId = "e8000000-0000-4000-8000-000000000001";
  const originalOrder = (await db.query("select status from public.work_orders where id=$1", [orderId])).rows[0];
  const originalAssignment = (await db.query("select status,actual_start_at from public.work_order_assignments where id=$1", [assignmentId])).rows[0];
  try {
    // Only the isolated local fixture enters this display state. No completion,
    // time entry, extra-work command or report is submitted by this UI test.
    await db.query("update public.work_orders set status='in_progress' where id=$1", [orderId]);
    await db.query("update public.work_order_assignments set status='in_progress',actual_start_at=clock_timestamp() where id=$1", [assignmentId]);
    await page.setViewportSize({ width: 320, height: 740 });
    await authenticateStaff(page, "field-worker@fieldgrid.test");
    await page.getByRole("button", { name: /WB-2030-001/ }).click();
    const sheet = page.getByRole("dialog", { name: "Werkbon WB-2030-001", exact: true });
    await sheet.getByRole("tab", { name: "Werkzaamheden", exact: true }).click();
    const extra = sheet.locator(".staff-panel").filter({ has: page.getByRole("heading", { name: "Meerwerk", exact: true }) });
    await extra.getByRole("button", { name: "Toevoegen", exact: true }).click();
    const extraDialog = page.getByRole("dialog", { name: "Meerwerk toevoegen", exact: true });
    await inspectDialog(page, extraDialog, info, "extra-work-320");
    await extraDialog.getByRole("button", { name: "Annuleren", exact: true }).click();
    await sheet.getByRole("button", { name: "Werk afronden", exact: true }).click();
    const completion = page.getByRole("dialog", { name: "Werkbon gereedmelden", exact: true });
    await inspectDialog(page, completion, info, "completion-320");
    await expect(completion.getByRole("button", { name: "Inzet stoppen en rapport openen", exact: true })).toBeDisabled();
    await completion.getByRole("button", { name: "Nog iets wijzigen", exact: true }).click();
    await sheet.getByRole("button", { name: "Sluiten", exact: true }).click();
  } finally {
    await db.query("update public.work_order_assignments set status=$2,actual_start_at=$3 where id=$1", [assignmentId, originalAssignment.status, originalAssignment.actual_start_at]);
    await db.query("update public.work_orders set status=$2 where id=$1", [orderId, originalOrder.status]);
    await db.end();
  }
});
