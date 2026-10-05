import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateStaff } from "./staff-auth";

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked", "true");
  await expect(page.locator(".ps-top-actions .icon-button").first()).toBeVisible();
  await expect(page.locator(".ps-topbar-leading .ps-sync.current")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
}

test("Mijn uren toont dagtotalen en weeknavigatie zonder fictieve registraties", async ({ page }, info) => {
  await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=uren");
  await expect(page.getByRole("heading", { name: "Mijn uren", exact: true })).toBeVisible();
  const metrics = page.getByLabel("Geregistreerde dagtotalen");
  await expect(metrics.locator("strong")).toHaveText(["0 min", "0 min", "0 min"]);
  await expect(page.getByRole("button", { name: "Werkdag afsluiten", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Correctie doorgeven", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Uren akkoord geven", exact: true })).toBeDisabled();
  const week = page.locator(".ps-hours-week-panel");
  const current = week.getByRole("button", { name: "Terug naar huidige week", exact: true });
  await expect(current).toBeDisabled();
  await week.getByRole("button", { name: "Vorige week", exact: true }).click();
  await expect(current).toBeEnabled();
  await expect(week.getByRole("heading", { name: "Weekoverzicht", exact: true })).toBeVisible();
  await current.click();
  await expect(current).toBeDisabled();
  await page.setViewportSize({ width: 1920, height: 944 });
  await capture(page, info, "hours-empty-1920");
  await page.setViewportSize({ width: 320, height: 944 });
  const navigation = page.getByRole("navigation", { name: "Mobiele navigatie" });
  await expect(navigation.getByRole("button", { name: "Mijn uren", exact: true })).toBeVisible();
  await capture(page, info, "hours-empty-320");
});

test("dagtotalen, afsluiten, akkoord en correctie gebruiken echte eigen registraties", async ({ page }, info) => {
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  let person: { id: string; tenant_id: string; day: string } | undefined;
  try {
    person = (await db.query("select p.id,p.tenant_id,to_char(clock_timestamp() at time zone t.timezone,'YYYY-MM-DD') as day from public.personnel p join public.tenants t on t.id=p.tenant_id join auth.users u on u.id=p.user_id where t.slug='fieldgrid-e2e' and u.email='field-worker@fieldgrid.test'" )).rows[0];
    expect(person).toBeDefined();
    const { id, tenant_id: tenant, day } = person!;
    // Fail on existing data instead of overwriting another test's daystate.
    const baseline = await db.query("select (select count(*) from public.time_entries where tenant_id=$1 and personnel_id=$2 and (starts_at at time zone 'Europe/Amsterdam')::date=$3::date)::int entries,(select count(*) from public.staff_day_reviews where tenant_id=$1 and personnel_id=$2 and day=$3::date)::int reviews", [tenant, id, day]);
    expect(baseline.rows[0]).toEqual({ entries: 0, reviews: 0 });
    for (const [index, kind, start, end] of [[0, "work", "08:00", "09:30"], [1, "travel", "09:30", "10:00"], [2, "break", "10:00", "10:15"], [3, "other", "10:15", "10:57"]] as const) {
      await db.query("insert into public.time_entries(id,tenant_id,personnel_id,kind,starts_at,ends_at) values($1,$2,$3,$4,($5::date+$6::time) at time zone 'Europe/Amsterdam',($5::date+$7::time) at time zone 'Europe/Amsterdam')", [ids[index], tenant, id, kind, day, start, end]);
    }
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=uren");
    await expect(page.getByLabel("Geregistreerde dagtotalen").locator("strong")).toHaveText(["2 u 42 min", "1 u 30 min", "30 min"]);
    await expect(page.locator(".ps-hours-break")).toContainText("15 min");
    await expect(page.locator(".ps-hours-week-total strong")).toHaveText("2 u 42 min");
    await expect(page.getByRole("button", { name: "Uren akkoord geven", exact: true })).toBeDisabled();
    for (const width of [1920, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 944 });
      await capture(page, info, `hours-filled-${width}`);
    }
    await page.getByRole("button", { name: "Werkdag afsluiten", exact: true }).click();
    await expect(page.locator(".ps-hours-day .ps-status")).toHaveText("Afgesloten");
    await page.getByRole("button", { name: "Uren akkoord geven", exact: true }).click();
    await expect(page.locator(".ps-hours-day .ps-status")).toHaveText("Door mij akkoord");
    await page.getByRole("button", { name: "Correctie doorgeven", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Correctie doorgeven", exact: true });
    await dialog.getByRole("button", { name: "Werk op locatie · 08:00 – 09:30", exact: true }).click();
    await dialog.getByLabel("Correcte duur (minuten)").fill("95");
    await dialog.getByLabel("Reden voor correctie").fill("Fictieve correctie voor de gerichte browsercontrole.");
    await dialog.getByRole("button", { name: "Correctieverzoek indienen", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".ps-hours-day .ps-status")).toHaveText("Correctie in behandeling");
    await expect(page.getByLabel("Geregistreerde dagtotalen").locator("strong")).toHaveText(["2 u 42 min", "1 u 30 min", "30 min"]);
    const stored = await db.query("select round(extract(epoch from (ends_at-starts_at))/60)::int minutes from public.time_entries where id=$1", [ids[0]]);
    expect(stored.rows[0].minutes).toBe(90);
    expect((await db.query("select state from public.staff_day_reviews where tenant_id=$1 and personnel_id=$2 and day=$3", [tenant, id, day])).rows[0].state).toBe("confirmed");
  } finally {
    await db.query("delete from public.staff_time_correction_requests where time_entry_id=any($1::uuid[])", [ids]);
    if (person && (await db.query("select count(*)::int total from public.time_entries where id=any($1::uuid[])", [ids])).rows[0].total > 0) {
      await db.query("delete from public.staff_day_reviews where tenant_id=$1 and personnel_id=$2 and day=$3", [person.tenant_id, person.id, person.day]);
    }
    await db.query("delete from public.time_entries where id=any($1::uuid[])", [ids]);
    await db.end();
  }
});
