import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test("personeelsnummering is instelbaar, automatisch en per medewerker aanpasbaar", async ({ page }) => {
  test.setTimeout(60_000);
  const url = requireLocalApiUrl();
  const admin = createClient<Database>(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenant, error } = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").single();
  if (error) throw error;
  const { data: original, error: settingsError } = await admin.from("tenant_settings").select("personnel_number_prefix,personnel_number_start").eq("tenant_id", tenant.id).single();
  if (settingsError) throw settingsError;
  const prefix = `E2E${Date.now().toString(36)}-`;
  const emails = [`auto-${prefix}@fieldgrid.test`, `manual-${prefix}@fieldgrid.test`];
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/instellingen");
    await page.waitForURL("**/app/instellingen");
    const settings = page.getByRole("region", { name: "Personeelsnummering" });
    await settings.getByLabel("Voorvoegsel (prefix)").fill("MW-");
    await settings.getByRole("spinbutton", { name: /^Startnummer/ }).fill("100");
    await expect(settings.getByText("MW-0100", { exact: true })).toBeVisible();
    await expect(settings).toHaveScreenshot("personnel-number-settings-1440.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(settings).toHaveScreenshot("personnel-number-settings-390.png");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await settings.getByLabel("Voorvoegsel (prefix)").fill(prefix);
    await settings.getByRole("button", { name: "Nummering opslaan" }).click();
    await expect(page.locator('[data-sonner-toast]').getByText("Nummering opslaan", { exact: true })).toBeVisible();
    await page.reload();
    await expect(settings.getByLabel("Voorvoegsel (prefix)")).toHaveValue(prefix);
    await expect(settings.getByRole("spinbutton", { name: /^Startnummer/ })).toHaveValue("100");
    await page.getByRole("link", { name: "Personeel", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "Nieuwe medewerker" });
    const openWizard = async (email: string) => {
      await page.getByRole("button", { name: "Nieuwe medewerker" }).click();
      await wizard.getByLabel("Volledige naam").fill(`Medewerker ${email.split("@")[0]}`);
      await wizard.getByLabel("E-mailadres").fill(email);
      await wizard.getByRole("button", { name: "Volgende" }).click();
    };
    await openWizard(emails[0]);
    await expect(wizard.getByLabel("Personeelsnummer", { exact: true })).toHaveValue(`${prefix}0100`);
    await wizard.getByRole("button", { name: "Sluiten" }).click();
    await openWizard(emails[0]);
    await expect(wizard.getByLabel("Personeelsnummer", { exact: true })).toHaveValue(`${prefix}0100`);
    await wizard.getByLabel("Personeelsnummer", { exact: true }).fill("Tijdelijke afwijking");
    await wizard.getByRole("button", { name: "Automatisch nummer gebruiken" }).click();
    await expect(wizard.getByLabel("Personeelsnummer", { exact: true })).toHaveValue(`${prefix}0100`);
    await wizard.getByRole("button", { name: "Volgende" }).click();
    await wizard.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(wizard).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: emails[0] })).toContainText(`${prefix}0100`);
    await openWizard(emails[1]);
    await expect(wizard.getByLabel("Personeelsnummer", { exact: true })).toHaveValue(`${prefix}0101`);
    await wizard.getByLabel("Personeelsnummer", { exact: true }).fill(`${prefix}0100`);
    await wizard.getByRole("button", { name: "Volgende" }).click();
    await wizard.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(page.getByText("Dit personeelsnummer is al in gebruik. Kies een ander nummer.", { exact: true })).toBeVisible();
    await expect(wizard).toBeVisible();
    await wizard.getByRole("button", { name: "Vorige" }).click();
    await wizard.getByLabel("Personeelsnummer", { exact: true }).fill(`${prefix}0150`);
    await wizard.getByRole("button", { name: "Vorige" }).click();
    await wizard.getByRole("button", { name: "Volgende" }).click();
    await expect(wizard.getByLabel("Personeelsnummer", { exact: true })).toHaveValue(`${prefix}0150`);
    await wizard.getByRole("button", { name: "Volgende" }).click();
    await wizard.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(wizard).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: emails[1] })).toContainText(`${prefix}0150`);
    await page.getByRole("button", { name: "Nieuwe medewerker" }).click();
    await expect(wizard.locator('input[name="employeeNumber"]')).toHaveValue(`${prefix}0151`);
    await wizard.getByRole("button", { name: "Annuleren" }).click();
  } finally {
    await admin.from("tenant_settings").update(original).eq("tenant_id", tenant.id);
    const { data: created } = await admin.from("personnel").select("id,user_id").eq("tenant_id", tenant.id).in("email", emails);
    for (const person of created ?? []) {
      await admin.from("personnel").delete().eq("tenant_id", tenant.id).eq("id", person.id);
      if (person.user_id) await admin.auth.admin.deleteUser(person.user_id);
    }
  }
});
