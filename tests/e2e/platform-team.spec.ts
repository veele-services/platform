import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { signInWithEmailOtp } from "./login-auth";

// Owner commands use real OTP. Never record authentication codes or cookies.
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15_000 });
test.setTimeout(180_000);

test("platformbeheer nodigt support uit, begrenst toegang en trekt een bestaande OTP-sessie live in", async ({ page, browser }, info) => {
  const email = `support-browser-${randomUUID()}@fieldgrid.test`, name = "Alex Supporttest";
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  const admin = createClient(requireLocalApiUrl().href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const recipient = await browser.newContext({ baseURL: "http://127.0.0.1:3000", locale: "nl-NL" }), coworker = await recipient.newPage();
  let userId = "";
  let tenantId = "", originalModules: string[] = [];
  await db.connect();
  try {
    tenantId = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
    originalModules = (await db.query("select enabled_services from public.tenant_settings where tenant_id=$1", [tenantId])).rows[0].enabled_services;
    const enabled = await admin.from("tenant_settings").update({ enabled_services: [...new Set([...originalModules, "tickets"])] }).eq("tenant_id", tenantId);
    if (enabled.error) throw new Error("Could not enable the isolated support tenant fixture");
    await signInWithEmailOtp(page, "platform-admin@fieldgrid.test", "/platform/team");
    await expect(page.locator(".fg-sidebar").getByRole("link", { name: "Supportteam", exact: true })).toHaveAttribute("aria-current", "page");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const title of ["Medewerkers", "Rechten", "Activiteit"]) {
        const tab = page.getByRole("tab", { name: title, exact: true });
        await tab.click();
        const surface = page.getByRole("tabpanel", { name: title, exact: true }).locator("section").first();
        await expect.poll(async () => {
          const t = await tab.boundingBox(), s = await surface.boundingBox();
          return Boolean(t && s && Math.abs(t.y + t.height - s.y) <= 2);
        }).toBe(true);
        await expect.poll(() => surface.evaluate(node => getComputedStyle(node).borderTopLeftRadius)).toBe("0px");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.getByRole("tab", { name: "Medewerkers", exact: true }).click();
      await page.getByRole("button", { name: "Supportmedewerker uitnodigen", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Supportmedewerker uitnodigen", exact: true });
      await expect.poll(() => modal.evaluate(node => node.contains(document.activeElement))).toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await modal.evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      await page.screenshot({ path: info.outputPath(`support-invite-${width}.png`) });
      await modal.getByRole("button", { name: "Annuleren", exact: true }).click();
      await expect(modal).toBeHidden();
    }
    await page.getByRole("button", { name: "Supportmedewerker uitnodigen", exact: true }).click();
    const invite = page.getByRole("dialog", { name: "Supportmedewerker uitnodigen", exact: true });
    await invite.getByLabel("Naam supportmedewerker", { exact: true }).fill(name);
    await invite.getByLabel("E-mailadres supportmedewerker", { exact: true }).fill(email);
    await invite.getByRole("checkbox", { name: /^Alle actieve organisaties/ }).uncheck();
    await expect(invite.getByRole("button", { name: "Uitnodiging versturen", exact: true })).toBeDisabled();
    await invite.getByRole("checkbox", { name: "Demo Organisatie", exact: true }).check();
    await invite.getByRole("button", { name: "Uitnodiging versturen", exact: true }).click();
    await expect(invite).toBeHidden();
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toContainText("Actief"); await expect(row).toContainText("Verzonden");
    userId = (await db.query("select id from auth.users where email=$1", [email])).rows[0].id;
    expect((await db.query("select count(*) from public.platform_admins where user_id=$1", [userId])).rows[0].count).toBe("0");
    let mails: Array<{ subject: string; content: Array<{ type: string; value: string }>; tracking_settings: { click_tracking: { enable: boolean }; open_tracking: { enable: boolean } } }> = [];
    await expect.poll(async () => { mails = await (await fetch(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(email)}`)).json(); return mails.length; }).toBe(1);
    const text = mails[0].content.find(part => part.type === "text/plain")?.value ?? "";
    expect(mails[0].subject).toBe("Uitnodiging voor Fieldgrid-support"); expect(text).toContain("eenmalige inlogcode"); expect(text).not.toContain("token_hash");
    const login = new URL(text.match(/http:\/\/127\.0\.0\.1:3000\/login[^\s]+/)?.[0] ?? "");
    expect(login.searchParams.get("next")).toBe("/platform/support");
    expect(mails[0].tracking_settings.click_tracking.enable).toBe(false); expect(mails[0].tracking_settings.open_tracking.enable).toBe(false);
    await signInWithEmailOtp(coworker, email, "/platform/support");
    await expect(coworker.locator(".fg-sidebar").getByRole("link", { name: "Supportdesk", exact: true })).toBeVisible();
    for (const title of ["Tenants", "Supportteam", "Supportinstellingen", "Nieuwe tenant"]) await expect(coworker.locator(".fg-sidebar").getByRole("link", { name: title, exact: true })).toHaveCount(0);
    expect((await coworker.request.get("/platform/team")).status()).toBe(404);
    await coworker.goto("/app"); await expect(coworker).toHaveURL(/\/platform\/support$/);
    await row.getByRole("button", { name: `Bewerk ${name}`, exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Supportmedewerker bewerken", exact: true });
    await edit.getByLabel("Naam supportmedewerker", { exact: true }).fill("Alex Bijgewerkt");
    await edit.getByRole("button", { name: "Profiel opslaan", exact: true }).click(); await expect(edit).toBeHidden();
    await expect(row).toContainText("Alex Bijgewerkt");
    await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: info.outputPath("support-team-1440.png") });
    await row.getByRole("button", { name: "Trek toegang van Alex Bijgewerkt in", exact: true }).click();
    const revoke = page.getByRole("dialog", { name: "Supporttoegang intrekken", exact: true });
    await revoke.getByRole("button", { name: "Toegang intrekken", exact: true }).click(); await expect(revoke).toBeHidden();
    await expect(row).toContainText("Ingetrokken");
    // The coworker retains the original session and must lose the shell anyway.
    await coworker.reload(); await expect(coworker.locator(".fg-console")).toHaveCount(0);
    expect((await coworker.request.get("/platform/support")).status()).toBe(404);
  } finally {
    if (tenantId) {
      const restored = await admin.from("tenant_settings").update({ enabled_services: originalModules }).eq("tenant_id", tenantId);
      if (restored.error) throw new Error("Could not restore isolated tenant modules");
    }
    if (!userId) userId = (await db.query("select id from auth.users where email=$1", [email])).rows[0]?.id ?? "";
    if (userId) {
      await db.query("delete from private.platform_support_audit where user_id=$1", [userId]);
      await db.query("delete from private.platform_support_receipts where result->>'userId'=$1", [userId]);
      await db.query("delete from public.permission_grants where user_id=$1", [userId]);
      const removed = await admin.auth.admin.deleteUser(userId); if (removed.error) throw new Error("Could not clean up the isolated support fixture");
    }
    await recipient.close(); await db.end();
  }
});
