import { createBrandPalette } from "../../lib/branding/palette";
import { expect, test } from "@playwright/test";
import { ticketModule } from "./staff-modules";
import { authenticateStaff } from "./staff-auth";


test("Tickets blijft zichtbaar met uitleg als de module uitstaat", async ({ page, context }) => {
  const restore = await ticketModule(false);
  try {
    await authenticateStaff(page, "field-worker@fieldgrid.test");
    const entry = page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("button", { name: "Tickets", exact: true });
    await expect(entry).toBeVisible();
    await entry.click();
    const dialog = page.getByRole("dialog", { name: "Tickets nog niet actief" });
    await expect(dialog).toContainText("platformbeheerder");
    await expect(page).toHaveURL(/\/staff$/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(entry).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("button", { name: "Tickets", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Offline", exact: true })).toBeVisible();
    await expect(page.locator(".ps-topbar-leading .ps-sync > span")).toHaveText("Offline");
    await expect(page.locator(".ps-topbar-leading .ps-sync > span")).toBeVisible();
  } finally { await context.setOffline(false); await restore(); }
});

test("actieve Tickets opent de bestaande engine in dezelfde personeelsopmaak", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date("2030-01-15T08:00:00Z"));
  const restore = await ticketModule(true);
  try {
    await authenticateStaff(page, "field-worker@fieldgrid.test");
    const capture = async (name: string) => {
      await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked", "true");
      await expect(page.locator(".ps-top-actions .icon-button").first()).toBeVisible();
      await expect(page.locator(".ps-topbar-leading .ps-sync.current")).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
    };
    for (const width of [1920, 1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 944 });
      await expect(page.locator(".ps-week-day.active")).toHaveCSS("background-color", `rgb(${[1,3,5].map(i=>Number.parseInt(createBrandPalette("#214E72","#C65D21").action.slice(i,i+2),16)).join(", ")})`);
      await expect(page.locator(".ps-order-card").first()).toHaveCSS("background-color", `rgb(${[1,3,5].map(i=>Number.parseInt(createBrandPalette("#214E72","#C65D21").surface.slice(i,i+2),16)).join(", ")})`);
      await capture(`planning-${width}`);
    }
    await page.setViewportSize({ width: 1920, height: 944 });
    await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true })).toBeVisible();
    const bell = page.locator(".ps-top-actions .icon-button").first();
    await expect(bell).toBeVisible();
    await expect(bell).toHaveCSS("border-top-width", "1px");
    await expect(bell).toHaveCSS("border-radius", "12px");
    await page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mijn tickets", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true })).toHaveAttribute("aria-current", "page");
    await capture("tickets-1920");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mijn tickets", exact: true })).toBeVisible();
    await capture("tickets-390");
  } finally { await restore(); }
});

test("Meer houdt alle personeelsacties bereikbaar op mobiel en desktop", async ({ page }, info) => {
  test.setTimeout(90_000);
  const restore = await ticketModule(true);
  try {
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("heading", { name: "Meer", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Mijn profiel", exact: true })).toContainText("Robin de Vries");
      for (const title of ["Verlof", "Beschikbaarheid", "Documenten", "Instellingen", "Profiel", "Notificaties", "Tickets"]) {
        const tile = page.locator(".ps-more-card").filter({ has: page.getByText(title, { exact: true }) });
        await expect(tile).toHaveCount(1);
        await tile.scrollIntoViewIfNeeded();
        const bounds = await tile.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByRole("region", { name: "Open diensten", exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`more-${width}.png`), fullPage: true, animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const nav = page.getByRole("navigation", { name: "Mobiele navigatie" });
    await expect(nav.locator("button, a")).toHaveText(["Planning", "Nieuws", "Mijn uren", "Tickets", "Meer"]);
    await page.getByRole("button", { name: /^Profielmenu van/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Uitloggen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Profielmenu van/ })).toBeFocused();
    for (const [tile, heading] of [["Verlof", "Verlof"], ["Beschikbaarheid", "Beschikbaarheid"], ["Documenten", "Documenten"], ["Profiel", "Profiel"], ["Instellingen", "Instellingen"]]) {
      await page.locator(".ps-more-card").filter({ has: page.getByText(tile, { exact: true }) }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
      await nav.getByRole("button", { name: "Meer", exact: true }).click();
    }
    await page.locator(".ps-more-card").filter({ has: page.getByText("Notificaties", { exact: true }) }).click();
    await expect(page).toHaveURL(/\/staff\/notificaties$/);
    await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("link", { name: "Meer", exact: true }).click();
    await page.locator(".ps-more-card").filter({ has: page.getByText("Tickets", { exact: true }) }).click();
    await expect(page).toHaveURL(/\/staff\/meldingen$/);
    await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("link", { name: "Meer", exact: true }).click();
    const signout = page.locator(".ps-more-signout");
    await expect(signout).toHaveAttribute("action", "/auth/signout");
    await expect(signout).toHaveAttribute("method", "post");
    const logout = signout.getByRole("button", { name: "Uitloggen", exact: true });
    await logout.scrollIntoViewIfNeeded();
    const bottom = await nav.boundingBox();
    const button = await logout.boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(bottom!.y);
  } finally { await restore(); }
});
