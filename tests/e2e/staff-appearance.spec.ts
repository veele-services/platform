import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl } from "./local-target";
import { authenticateStaff } from "./staff-auth";

async function ticketModule(enabled: boolean) {
  const api = requireLocalApiUrl();
  const admin = createClient<Database>(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const tenant = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").single();
  expect(tenant.error).toBeNull();
  const tenantId = tenant.data!.id;
  const settings = await admin.from("tenant_settings").select("enabled_services").eq("tenant_id", tenantId).single();
  expect(settings.error).toBeNull();
  const original = settings.data!.enabled_services;
  const services = original.filter(service => service !== "tickets");
  if (enabled) services.push("tickets");
  const result = await admin.from("tenant_settings").update({ enabled_services: services }).eq("tenant_id", tenantId);
  expect(result.error).toBeNull();
  return async () => {
    const restored = await admin.from("tenant_settings").update({ enabled_services: original }).eq("tenant_id", tenantId);
    expect(restored.error).toBeNull();
  };
}

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
      await expect(page.locator(".ps-week-day.active")).toHaveCSS("background-color", "rgb(54, 131, 65)");
      await expect(page.locator(".ps-order-card").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await capture(`planning-${width}`);
    }
    await page.setViewportSize({ width: 1920, height: 944 });
    await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true })).toBeVisible();
    const bell = page.locator(".ps-top-actions .icon-button").first();
    await expect(bell).toBeVisible();
    await expect(bell).toHaveCSS("border-top-width", "1px");
    await expect(bell).toHaveCSS("border-radius", "12px");
    await page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mijn meldingen", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("link", { name: "Tickets", exact: true })).toHaveAttribute("aria-current", "page");
    await capture("tickets-1920");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Mobiele navigatie" }).getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mijn meldingen", exact: true })).toBeVisible();
    await capture("tickets-390");
  } finally { await restore(); }
});
