import { Client } from "pg";
import { expect, test } from "@playwright/test";
import type { StaffAvailabilityPreferences } from "../../lib/staff/model";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateStaff } from "./staff-auth";

const fixturePreferences: StaffAvailabilityPreferences = {
  week: Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((key, index) => [key, {
    enabled: index < 5, start: "07:00", end: key === "friday" ? "16:00" : "17:00",
  }])),
  shifts: ["day"], weekends: false, holidays: true, planningNote: "Fictieve beschikbaarheidscontrole",
};

async function withAvailabilityFixture(enabled: boolean, run: (db: Client, person: { id: string; tenant_id: string }) => Promise<void>) {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  let original: { id: string; tenant_id: string; availability_preferences: StaffAvailabilityPreferences; availability_self_service_enabled: boolean } | undefined;
  try {
    original = (await db.query("select p.id,p.tenant_id,p.availability_preferences,p.availability_self_service_enabled from public.personnel p join public.tenants t on t.id=p.tenant_id join auth.users u on u.id=p.user_id where t.slug='fieldgrid-e2e' and u.email='field-worker@fieldgrid.test'")).rows[0];
    expect(original).toBeDefined();
    await db.query("update public.personnel set availability_preferences=$3,availability_self_service_enabled=$4 where tenant_id=$1 and id=$2", [original!.tenant_id, original!.id, fixturePreferences, enabled]);
    await run(db, original!);
  } finally {
    if (original) await db.query("update public.personnel set availability_preferences=$3,availability_self_service_enabled=$4 where tenant_id=$1 and id=$2", [original.tenant_id, original.id, original.availability_preferences, original.availability_self_service_enabled]);
    await db.end();
  }
}

test("Beschikbaarheid volgt het prototype wanneer planning de week beheert", async ({ page }, info) => {
  test.setTimeout(90_000);
  await withAvailabilityFixture(false, async (db, person) => {
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer&section=beschikbaarheid");
    const screen = page.locator(".ps-availability-screen");
    await expect(screen.getByRole("heading", { name: "Beschikbaarheid", exact: true })).toBeVisible();
    await expect(screen.getByText("Beheerd door planning", { exact: true })).toBeVisible();
    await expect(screen.locator(".ps-availability-managed")).toContainText("Neem voor een wijziging contact op met de planning.");
    await expect(screen.getByLabel("Maandag vanaf", { exact: true })).toHaveValue("07:00");
    await expect(screen.getByLabel("Vrijdag tot", { exact: true })).toHaveValue("16:00");
    for (const label of ["Maandag vanaf", "Zaterdag vanaf", "Zondag tot"]) await expect(screen.getByLabel(label, { exact: true })).toBeDisabled();
    await expect(screen.getByLabel("Zaterdag vanaf", { exact: true })).toHaveValue("");
    await expect(screen.getByLabel("Zondag tot", { exact: true })).toHaveValue("");
    await expect(screen.getByRole("button", { name: "Beschikbaarheid opslaan", exact: true })).toBeDisabled();
    await expect(screen.getByRole("heading", { name: "Goed om te weten", exact: true })).toBeVisible();
    await expect(screen.getByRole("heading", { name: "Tijdelijk afwezig?", exact: true })).toBeVisible();
    for (const width of [1920, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 944 });
      await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked", "true");
      await expect(page.locator(".ps-top-actions .icon-button").first()).toBeVisible();
      await expect(page.locator(".ps-topbar-leading .ps-sync.current")).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`availability-${width}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
    }
    expect((await db.query("select availability_preferences from public.personnel where tenant_id=$1 and id=$2", [person.tenant_id, person.id])).rows[0].availability_preferences).toEqual(fixturePreferences);
    await screen.getByRole("button", { name: "Naar mijn verlof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verlof", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Verlof aanvragen", exact: true })).toBeVisible();
  });
});

test("Vrijgegeven beschikbaarheid bewaart tijdvakken, lege dagen en voorkeuren zonder een nieuwere versie te overschrijven", async ({ page }) => {
  test.setTimeout(90_000);
  await withAvailabilityFixture(true, async (db, person) => {
    const saved = async () => (await db.query("select availability_preferences,version::int as version from public.personnel where tenant_id=$1 and id=$2", [person.tenant_id, person.id])).rows[0] as { availability_preferences: StaffAvailabilityPreferences; version: number };
    const initial = await saved();
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer&section=beschikbaarheid");
    const screen = page.locator(".ps-availability-screen");
    const save = screen.getByRole("button", { name: "Beschikbaarheid opslaan", exact: true });
    await expect(save).toBeEnabled();
    await expect(screen.getByText("Bewerken toegestaan", { exact: true })).toBeVisible();
    await screen.getByLabel("Zaterdag vanaf", { exact: true }).fill("09:00");
    await save.click();
    await expect.poll(() => screen.getByLabel("Zaterdag tot", { exact: true }).evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
    expect((await saved()).version).toBe(initial.version);
    await screen.getByLabel("Zaterdag vanaf", { exact: true }).fill("");
    await screen.getByLabel("Maandag tot", { exact: true }).fill("07:00");
    await save.click();
    await expect(screen.getByRole("alert")).toContainText("de eindtijd moet na de begintijd liggen");
    expect((await saved()).version).toBe(initial.version);
    await screen.getByLabel("Maandag vanaf", { exact: true }).fill("08:30");
    await screen.getByLabel("Maandag tot", { exact: true }).fill("16:30");
    await screen.getByLabel("Dinsdag vanaf", { exact: true }).fill("");
    await screen.getByLabel("Dinsdag tot", { exact: true }).fill("");
    await save.click();
    await expect.poll(async () => (await saved()).version).toBeGreaterThan(initial.version);
    await expect(save).toBeEnabled();
    const first = await saved();
    expect(first.availability_preferences.week.monday).toEqual({ enabled: true, start: "08:30", end: "16:30" });
    expect(first.availability_preferences.week.tuesday).toEqual({ enabled: false, start: "07:00", end: "17:00" });
    expect(first.availability_preferences.shifts).toEqual(["day"]);
    expect(first.availability_preferences.holidays).toBe(true);
    expect(first.availability_preferences.planningNote).toBe(fixturePreferences.planningNote);
    await screen.getByText("Overige planningsvoorkeuren", { exact: true }).click();
    await screen.getByLabel("Planningsopmerking", { exact: true }).fill("Fictieve tweede opgeslagen voorkeur");
    await save.click();
    await expect.poll(async () => (await saved()).version).toBeGreaterThan(first.version);
    await expect(save).toBeEnabled();
    expect((await saved()).availability_preferences.planningNote).toBe("Fictieve tweede opgeslagen voorkeur");
    await page.reload();
    await expect(screen.getByLabel("Dinsdag vanaf", { exact: true })).toHaveValue("");
    await expect(screen.getByLabel("Maandag vanaf", { exact: true })).toHaveValue("08:30");
    await screen.getByLabel("Maandag tot", { exact: true }).fill("16:45");
    await db.query("update public.personnel set availability_preferences=jsonb_set(availability_preferences,'{planningNote}','\"Fictieve gelijktijdige plannerwijziging\"') where tenant_id=$1 and id=$2", [person.tenant_id, person.id]);
    await save.click();
    await expect(page.getByText("Je beschikbaarheid is intussen gewijzigd. Laad haar opnieuw.", { exact: true })).toBeVisible();
    const concurrent = await saved();
    expect(concurrent.availability_preferences.planningNote).toBe("Fictieve gelijktijdige plannerwijziging");
    expect(concurrent.availability_preferences.week.monday.end).toBe("16:30");
  });
});
