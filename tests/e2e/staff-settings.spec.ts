import { Client } from "pg";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateStaff } from "./staff-auth";

type Person = { id: string; tenant_id: string; user_id: string; full_name: string; mobile_phone: string | null };
async function fixture(db: Client) {
  const person = (await db.query("select p.id,p.tenant_id,p.user_id,p.full_name,p.mobile_phone from public.personnel p join public.tenants t on t.id=p.tenant_id join auth.users u on u.id=p.user_id where t.slug='fieldgrid-e2e' and u.email='field-worker@fieldgrid.test'")).rows[0] as Person | undefined;
  expect(person).toBeDefined();
  return person!;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked", "true");
  await expect(page.locator(".ps-top-actions .icon-button").first()).toBeVisible();
  await expect(page.locator(".ps-topbar-leading .ps-sync.current")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", style: "nextjs-portal,[data-sonner-toaster]{visibility:hidden}" });
}

test("Instellingen toont de prototypeonderdelen en bewaart alleen naam en mobiel met versiecontrole", async ({ page }, info) => {
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  let person: Person | undefined;
  try {
    person = await fixture(db);
    const profile = async () => (await db.query("select to_jsonb(p)-'updated_at'-'version'-'full_name'-'mobile_phone' as other,full_name,mobile_phone,version::int as version from public.personnel p where p.tenant_id=$1 and p.id=$2", [person!.tenant_id, person!.id])).rows[0];
    const initial = await profile();
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer&section=instellingen");
    const screen = page.locator(".ps-settings-screen");
    const nav = screen.getByRole("tablist", { name: "Instellingenonderdelen", exact: true });
    await expect(nav.getByRole("tab")).toHaveText(["Mijn profiel", "Meldingen", "Account & toegang"]);
    await expect(screen.getByLabel("E-mailadres", { exact: true })).toHaveValue("field-worker@fieldgrid.test");
    await expect(screen.getByLabel("E-mailadres", { exact: true })).toHaveAttribute("readonly", "");
    for (const width of [1920, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 944 });
      for (const [name, image] of [["Mijn profiel", "profile"], ["Meldingen", "notifications"], ["Account & toegang", "account"]]) {
        await nav.getByRole("tab", { name, exact: true }).click();
        await capture(page, info, `settings-${image}-${width}`);
      }
    }
    await nav.getByRole("tab", { name: "Mijn profiel", exact: true }).click();
    const save = screen.getByRole("button", { name: "Gegevens opslaan", exact: true });
    await screen.getByLabel("Naam", { exact: true }).fill("Robin Fictieve profielcontrole");
    await screen.getByLabel("Telefoonnummer", { exact: true }).fill("+31612345678");
    await save.click();
    await expect.poll(async () => (await profile()).version).toBeGreaterThan(initial.version);
    await expect(save).toBeEnabled();
    const first = await profile();
    expect(first.full_name).toBe("Robin Fictieve profielcontrole");
    expect(first.mobile_phone).toBe("+31612345678");
    expect(first.other).toEqual(initial.other);
    await screen.getByLabel("Telefoonnummer", { exact: true }).fill("+31687654321");
    await save.click();
    await expect.poll(async () => (await profile()).version).toBeGreaterThan(first.version);
    await expect(save).toBeEnabled();
    await page.reload();
    await expect(screen.getByLabel("Naam", { exact: true })).toHaveValue("Robin Fictieve profielcontrole");
    await expect(screen.getByLabel("Telefoonnummer", { exact: true })).toHaveValue("+31687654321");
    await screen.getByLabel("Naam", { exact: true }).fill("Fictieve verouderde invoer");
    await db.query("update public.personnel set full_name='Fictieve gelijktijdige HR-wijziging' where tenant_id=$1 and id=$2", [person.tenant_id, person.id]);
    await save.click();
    await expect(page.getByText("Je profiel is intussen gewijzigd. Laad het opnieuw.", { exact: true })).toBeVisible();
    expect((await profile()).full_name).toBe("Fictieve gelijktijdige HR-wijziging");
    expect((await profile()).other).toEqual(initial.other);
  } finally {
    if (person) await db.query("update public.personnel set full_name=$3,mobile_phone=$4 where tenant_id=$1 and id=$2", [person.tenant_id, person.id, person.full_name, person.mobile_phone]);
    await db.end();
  }
});

test("Meldingsschakelaars bewaren echte voorkeuren en accountacties gebruiken de bestaande sessiegrenzen", async ({ page }, info) => {
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  let person: Person | undefined;
  let original: Array<Record<string, unknown>> = [];
  try {
    person = await fixture(db);
    original = (await db.query("select * from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='staff'", [person.tenant_id, person.user_id])).rows;
    await db.query("insert into private.notification_preferences(tenant_id,user_id,context,email,push,quiet_start,quiet_end) values($1,$2,'staff',true,false,'22:00','07:00') on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,context,coalesce(type_code,'')) do update set email=true,push=false,quiet_start='22:00',quiet_end='07:00',revision=notification_preferences.revision+1", [person.tenant_id, person.user_id]);
    const saved = async () => (await db.query("select email,push,quiet_start::text,quiet_end::text,revision::int as revision from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='staff' and type_code is null", [person!.tenant_id, person!.user_id])).rows[0];
    await authenticateStaff(page, "field-worker@fieldgrid.test", "/staff?tab=meer&section=instellingen");
    const screen = page.locator(".ps-settings-screen");
    const nav = screen.getByRole("tablist", { name: "Instellingenonderdelen", exact: true });
    await nav.getByRole("tab", { name: "Meldingen", exact: true }).click();
    await expect(screen.getByRole("switch", { name: "Pushmeldingen", exact: true })).not.toBeChecked();
    await expect(screen.getByRole("switch", { name: "E-mail", exact: true })).toBeChecked();
    await expect(screen.getByRole("switch", { name: "Stille uren", exact: true })).toBeChecked();
    await page.setViewportSize({ width: 1920, height: 944 });
    await capture(page, info, "settings-notifications-saved-values-1920");
    for (const [name, field, checked] of [["Pushmeldingen", "push", true], ["E-mail", "email", false], ["Stille uren", "quiet_start", false]] as const) {
      await screen.getByRole("switch", { name, exact: true }).click();
      await expect.poll(async () => Boolean((await saved())[field])).toBe(checked);
      await expect(screen.getByRole("switch", { name, exact: true })).toBeEnabled();
    }
    await screen.getByRole("switch", { name: "Stille uren", exact: true }).click();
    await expect.poll(async () => (await saved()).quiet_start).toBe("22:00:00");
    expect((await saved()).quiet_end).toBe("07:00:00");
    await expect(screen.getByRole("switch", { name: "Stille uren", exact: true })).toBeEnabled();
    await page.reload();
    await nav.getByRole("tab", { name: "Meldingen", exact: true }).click();
    await expect(screen.getByRole("switch", { name: "Pushmeldingen", exact: true })).toBeChecked();
    await expect(screen.getByRole("switch", { name: "E-mail", exact: true })).not.toBeChecked();
    await expect(screen.getByRole("switch", { name: "Stille uren", exact: true })).toBeChecked();
    await screen.getByRole("button", { name: "Testmelding tonen", exact: true }).click();
    await expect(page.getByText("Dit is een testmelding in je personeelsapp.", { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "Apparaat instellen", exact: true }).click();
    const push = page.getByRole("dialog", { name: "Pushmeldingen instellen", exact: true });
    await expect(push).toBeVisible();
    await expect(push.getByRole("button", { name: "Inschakelen / registratie herstellen", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(push).toBeHidden();
    await expect(screen.getByRole("button", { name: "Apparaat instellen", exact: true })).toBeFocused();
    await db.query("update private.notification_preferences set revision=revision+1 where tenant_id=$1 and user_id=$2 and context='staff' and type_code is null", [person.tenant_id, person.user_id]);
    await screen.getByRole("switch", { name: "E-mail", exact: true }).click();
    await expect(page.getByText("Deze gegevens zijn intussen gewijzigd. Vernieuw en controleer je invoer; er is niets overschreven.", { exact: true })).toBeVisible();
    await expect(screen.getByRole("switch", { name: "E-mail", exact: true })).not.toBeChecked();
    expect((await saved()).email).toBe(false);
    await nav.getByRole("tab", { name: "Account & toegang", exact: true }).click();
    await screen.getByRole("button", { name: "Loginflow bekijken", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Inloggen met e-mailcode", exact: true });
    await expect(login).toContainText("field-worker@fieldgrid.test");
    await expect(login.getByRole("listitem")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(login).toBeHidden();
    await screen.getByRole("button", { name: "Uitloggen", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    if (person) {
      await db.query("delete from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='staff' and id<>all($3::uuid[])", [person.tenant_id, person.user_id, original.map(row => row.id)]);
      for (const row of original) await db.query("update private.notification_preferences set in_app=$4,push=$5,email=$6,timezone=$7,quiet_start=$8,quiet_end=$9,revision=revision+1 where tenant_id=$1 and user_id=$2 and id=$3", [person.tenant_id, person.user_id, row.id, row.in_app, row.push, row.email, row.timezone, row.quiet_start, row.quiet_end]);
    }
    await db.end();
  }
});
