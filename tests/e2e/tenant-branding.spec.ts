import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { createBrandPalette } from "../../lib/branding/palette";
import { authenticateWorkspace } from "./login-auth";
import { requireLocalApiUrl } from "./local-target";

const rgb = (hex: string) => `rgb(${[1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)).join(", ")})`;

test("centrale huisstijl bewaart concepten, publiceert kleuren en weigert gelijktijdig overschrijven", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = requireLocalApiUrl();
  const admin = createClient<Database>(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const tenant = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").single();
  expect(tenant.error).toBeNull();
  const tenantId = tenant.data!.id;
  const source = await admin.from("tenant_branding").select("primary_color,accent_color,logo_path,sender_name,sender_email").eq("tenant_id", tenantId).single();
  expect(source.error).toBeNull();
  const original = source.data!;
  const second = await context.newPage();
  try {
    await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/instellingen");
    const primary = page.getByLabel("Primaire kleur hexcode", { exact: true });
    const accent = page.getByLabel("Secundaire kleur hexcode", { exact: true });
    await primary.fill("#315794");
    await accent.fill("#52b3b7");
    const draft = createBrandPalette("#315794", "#52b3b7");
    await expect(page.locator(".tenant-branding-preview-button")).toHaveCSS("background-color", rgb(draft.action));
    await expect(page.locator(".workspace-shell")).toHaveCSS("--brand-primary", original.primary_color.toLowerCase());
    await page.getByRole("button", { name: "Wijzigingen annuleren" }).click();
    await expect(primary).toHaveValue(original.primary_color.toLowerCase());

    await second.goto("/app/instellingen");
    const secondPrimary = second.getByLabel("Primaire kleur hexcode", { exact: true });
    await secondPrimary.fill("#123456");
    await primary.fill("#315794");
    await accent.fill("#52b3b7");
    await page.getByRole("button", { name: "Huisstijl opslaan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Je huisstijl is opgeslagen" })).toBeVisible();
    await expect(page.locator(".workspace-shell")).toHaveCSS("--brand-primary", "#315794");
    // Invalidation updates the shell while preserving an edited source and draft.
    await second.bringToFront();
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(second.locator(".workspace-shell")).toHaveCSS("--brand-primary", "#315794");
    await expect(secondPrimary).toHaveValue("#123456");
    await second.getByRole("button", { name: "Huisstijl opslaan" }).click();
    await expect(second.locator(".tenant-house-style").getByRole("alert")).toContainText("intussen gewijzigd");
    await expect(secondPrimary).toHaveValue("#123456");
    second.once("dialog", dialog => dialog.accept());
    await second.getByRole("button", { name: "Actuele instellingen gebruiken" }).click();
    await expect(secondPrimary).toHaveValue("#315794");

    second.once("dialog", dialog => dialog.accept());
    await second.getByRole("button", { name: "Fieldgrid-standaard" }).click();
    await expect(secondPrimary).toHaveValue("#222c35");
    await expect(second.getByLabel("Afzendernaam", { exact: true })).toHaveValue(original.sender_name ?? "Demo Organisatie");
    await expect(second.locator(".workspace-shell")).toHaveCSS("--brand-primary", "#315794");
    await second.getByRole("button", { name: "Wijzigingen annuleren" }).click();
    await expect(secondPrimary).toHaveValue("#315794");
    await second.getByLabel("Logo uploaden of vervangen").setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    await expect(second.locator(".tenant-house-style").getByRole("alert")).toContainText("PNG, JPG of WebP");
    await expect(second.getByRole("button", { name: "Huisstijl opslaan" })).toBeDisabled();
  } finally {
    const restored = await admin.from("tenant_branding").update(original).eq("tenant_id", tenantId);
    expect(restored.error).toBeNull();
    await second.close();
  }
});

test("tenantbackoffice blijft bruikbaar op smalle schermen en bewaart het dialogthema", async ({ page }) => {
  test.setTimeout(90_000);
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/instellingen");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Hoofdnavigatie" });
  await expect(navigation).toBeVisible();
  await expect(page.locator(".workspace-main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(navigation).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/klanten");
  await page.getByRole("button", { name: "Nieuwe klant", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-tenant-theme", "");
  const shellColor = await page.locator(".workspace-shell").evaluate(element => getComputedStyle(element).getPropertyValue("--brand-action").trim());
  await expect(dialog).toHaveCSS("--brand-action", shellColor);
  await expect(dialog).toHaveCSS("height", "810px");
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(dialog).toHaveCSS("height", "700px");
  await expect(dialog).toHaveCSS("width", "320px");
});
