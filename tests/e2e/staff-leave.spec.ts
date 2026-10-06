import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateStaff } from "./staff-auth";

test("Verlof volgt het prototype en behoudt aanvragen en intrekken", async ({ page }, info) => {
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const note = `Fictieve verlofcontrole ${randomUUID()}`;
  let person: { id: string; tenant_id: string; starts_on: string; ends_on: string; pending: number } | undefined;
  try {
    person = (await db.query("select p.id,p.tenant_id,to_char((clock_timestamp() at time zone t.timezone)::date+14,'YYYY-MM-DD') as starts_on,to_char((clock_timestamp() at time zone t.timezone)::date+18,'YYYY-MM-DD') as ends_on,(select count(*)::int from public.staff_leave_requests r where r.tenant_id=p.tenant_id and r.personnel_id=p.id and r.status='pending') as pending from public.personnel p join public.tenants t on t.id=p.tenant_id join auth.users u on u.id=p.user_id where t.slug='fieldgrid-e2e' and u.email='field-worker@fieldgrid.test'")).rows[0];
    expect(person).toBeDefined();
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer&section=verlof");
    const screen = page.locator(".ps-leave-screen");
    await expect(screen.getByRole("heading", { name: "Verlof", exact: true })).toBeVisible();
    const trigger = screen.locator(".ps-page-heading").getByRole("button", { name: "Verlof aanvragen", exact: true });
    await expect(trigger).toBeVisible();
    const metrics = screen.getByLabel("Verlofoverzicht");
    const balance = await metrics.locator("strong").first().innerText();
    await expect(metrics.locator("strong").last()).toHaveText(String(person!.pending));
    await page.setViewportSize({ width: 1920, height: 944 });
    for (const [upper, lower] of [[".ps-stat-grid", ".ps-leave-list"], [".ps-leave-list", ".list-pagination"], [".list-pagination", ".ps-hours-info"]]) {
      const gap = await screen.evaluate((element, selectors) => {
        const top = element.querySelector(selectors[0]!)!.getBoundingClientRect();
        const bottom = element.querySelector(selectors[1]!)!.getBoundingClientRect();
        return bottom.top - top.bottom;
      }, [upper, lower]);
      expect(gap).toBe(24);
    }
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Verlof aanvragen", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Sluiten", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByLabel("Vanaf", { exact: true }).fill(person!.starts_on);
    await dialog.getByLabel("Tot en met", { exact: true }).fill(person!.ends_on);
    await dialog.getByLabel("Toelichting", { exact: true }).fill(note);
    await dialog.getByRole("button", { name: "Aanvraag indienen", exact: true }).click();
    await expect(dialog).toBeHidden();
    const request = screen.locator(".ps-leave-request").filter({ hasText: note });
    await expect(request.locator(".ps-status")).toHaveText("In afwachting");
    await expect(metrics.locator("strong").last()).toHaveText(String(person!.pending + 1));
    await expect(metrics.locator("strong").first()).toHaveText(balance);
    for (const width of [1920, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 944 });
      await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked", "true");
      await expect(page.locator(".ps-top-actions .icon-button").first()).toBeVisible();
      await expect(page.locator(".ps-topbar-leading .ps-sync.current")).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`leave-${width}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
    }
    await request.getByRole("button", { name: "Aanvraag intrekken", exact: true }).click();
    await expect(request.locator(".ps-status")).toHaveText("Ingetrokken");
    await expect(metrics.locator("strong").last()).toHaveText(String(person!.pending));
    await expect(request.getByRole("button", { name: "Aanvraag intrekken", exact: true })).toHaveCount(0);
    expect((await db.query("select status from public.staff_leave_requests where tenant_id=$1 and personnel_id=$2 and note=$3", [person!.tenant_id, person!.id, note])).rows[0].status).toBe("withdrawn");
  } finally {
    if (person) await db.query("delete from public.staff_leave_requests where tenant_id=$1 and personnel_id=$2 and note=$3", [person.tenant_id, person.id, note]);
    await db.end();
  }
});
