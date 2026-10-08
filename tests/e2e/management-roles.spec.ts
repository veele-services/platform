import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { Database } from "../../lib/database.types";
import { authenticateWorkspace, signInWithEmailOtp } from "./login-auth";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";

// Real OTP authentication is required for owner commands. Never record codes,
// authentication cookies, invitation responses or network traces.
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15_000, navigationTimeout: 20_000 });
test.setTimeout(180_000);

type Mail = { subject: string; content: Array<{ type: string; value: string }>; tracking_settings: { click_tracking: { enable: boolean }; open_tracking: { enable: boolean } } };
const origin = "http://127.0.0.1:3000";
const mailbox = "http://127.0.0.1:59329";

async function joined(page: Page, tab: Locator, card: Locator) {
  await expect(card).toBeVisible();
  await expect.poll(async () => {
    const tabBox = await tab.boundingBox(), cardBox = await card.boundingBox();
    return Boolean(tabBox && cardBox && Math.abs(tabBox.y + tabBox.height - cardBox.y) <= 2);
  }).toBe(true);
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe("0px");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function latestMail(email: string) {
  let mails: Mail[] = [];
  await expect.poll(async () => {
    mails = await (await fetch(`${mailbox}/messages?recipient=${encodeURIComponent(email)}`)).json();
    return mails.length;
  }).toBe(1);
  return mails[0];
}

async function managementLayout(page: Page, info: TestInfo) {
  const regions = [["Gebruikers", "Managementgebruikers"], ["Rollen", "Managementrollen"], ["Rechten", "Rolrechten"]];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, region] of regions) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await joined(page, tab, page.getByRole("region", { name: region, exact: true }));
      if (name === "Rollen") {
        for (const role of ["Eigenaar", "Management", "Planning", "Administratie", "Support"]) await expect(page.getByRole("heading", { name: role, exact: true })).toBeVisible();
      }
      if (name === "Rechten") {
        await page.getByLabel("Rol voor rechten", { exact: true }).selectOption({ label: "Eigenaar" });
        await expect(page.getByRole("region", { name: "Rolrechten", exact: true }).getByRole("checkbox").first()).toBeDisabled();
        await page.getByLabel("Rol voor rechten", { exact: true }).selectOption({ label: "Planning" });
        await expect(page.getByRole("button", { name: "Rechten opslaan", exact: true })).toBeDisabled();
        await expect(page.getByRole("region", { name: "Rolrechten", exact: true })).not.toContainText("get_planboard");
        await page.screenshot({ path: info.outputPath(`management-rights-${width}.png`), animations: "disabled" });
      }
    }
    await page.getByRole("tab", { name: "Rechten", exact: true }).focus();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Gebruikers", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Managementgebruiker uitnodigen", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Managementgebruiker uitnodigen", exact: true });
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole("button", { name: "Sluiten", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Uitnodiging versturen", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Sluiten", exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`management-invite-dialog-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }

}

test("managementpagina heeft aangesloten tabs en toegankelijke dialogen op desktop en mobiel", async ({ page }, info) => {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", "/app/gebruikers");
  await expect(page.getByRole("heading", { name: "Gebruikers en rollen", exact: true })).toBeVisible();
  await managementLayout(page, info);
});

test("managementrollen bewaren mailuitnodiging, actuele rechten en bevestigde eigendomsoverdracht", async ({ page, browser }) => {
  const api = requireLocalApiUrl(), db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  const admin = createClient<Database>(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const marker = randomUUID(), ownerEmail = `management-owner-${marker}@fieldgrid.test`, invitedEmail = `management-invite-${marker}@fieldgrid.test`;
  const ownerName = "Alex Testeigenaar", invitedName = "Jamie Testplanner";
  const recipient = await browser.newContext({ baseURL: origin, locale: "nl-NL", timezoneId: "Europe/Amsterdam" });
  recipient.setDefaultTimeout(15_000);
  recipient.setDefaultNavigationTimeout(20_000);
  const memberPage = await recipient.newPage();
  let tenantId = "", ownerId = "", planningId = "", planningRevision = 0, initialPermissions: string[] = [];
  await db.connect();
  try {
    tenantId = (await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
    const owner = await admin.auth.admin.createUser({ email: ownerEmail, email_confirm: true, user_metadata: { full_name: ownerName } });
    if (owner.error) throw new Error("Could not create the isolated management owner fixture");
    ownerId = owner.data.user.id;
    const { error: membershipError } = await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, roles: ["tenant_admin"], status: "active" });
    if (membershipError) throw new Error("Could not create the isolated management owner membership");
    const planning = (await db.query("select id,revision from private.management_roles where tenant_id=$1 and code='planning'", [tenantId])).rows[0];
    planningId = planning.id; planningRevision = Number(planning.revision);
    initialPermissions = (await db.query("select capability from private.management_role_permissions where tenant_id=$1 and role_id=$2 order by capability", [tenantId, planningId])).rows.map(row => row.capability);

    await signInWithEmailOtp(page, ownerEmail, "/app/gebruikers");
    await expect(page.getByRole("heading", { name: "Gebruikers en rollen", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Managementgebruiker uitnodigen", exact: true }).click();
    const invitation = page.getByRole("dialog", { name: "Managementgebruiker uitnodigen", exact: true });
    await invitation.getByLabel("Volledige naam", { exact: true }).fill(invitedName);
    await invitation.getByLabel("E-mailadres", { exact: true }).fill(invitedEmail);
    await invitation.getByRole("combobox", { name: "Rol", exact: true }).selectOption({ label: "Planning" });
    await invitation.getByRole("button", { name: "Uitnodiging versturen", exact: true }).click();
    await expect(invitation).toBeHidden();
    const mail = await latestMail(invitedEmail), text = mail.content.find(part => part.type === "text/plain")?.value ?? "";
    expect(mail.subject).toBe("Uitnodiging voor Demo Organisatie");
    expect(text).toContain("rol Planning");
    expect(text).toContain("eenmalige inlogcode");
    expect(text).not.toContain("token_hash");
    const loginLink = new URL(text.match(/http:\/\/127\.0\.0\.1:3000\/login[^\s]+/)?.[0] ?? "");
    expect(loginLink.origin).toBe(origin); expect(loginLink.searchParams.get("next")).toBe("/app");
    expect(mail.tracking_settings.click_tracking.enable).toBe(false); expect(mail.tracking_settings.open_tracking.enable).toBe(false);
    await page.getByLabel("Gebruikers zoeken", { exact: true }).fill(invitedEmail);
    const memberRow = page.getByRole("row").filter({ hasText: invitedEmail });
    await expect(memberRow).toContainText("Uitgenodigd");

    // The invite adds an account; it does not install an authenticated session.
    await memberPage.goto("/app/planning");
    await expect(memberPage.getByRole("button", { name: "Inlogcode versturen", exact: true })).toBeVisible();
    await signInWithEmailOtp(memberPage, invitedEmail, "/app/planning");
    await expect(memberPage.getByRole("heading", { name: "Planbord", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Gebruikers en rollen", exact: true })).toHaveCount(0);

    // A role edit removes its dependent operations. The member keeps the same
    // real session, so this checks live page authorization rather than login.
    await page.getByRole("tab", { name: "Rechten", exact: true }).click();
    await page.getByLabel("Rol voor rechten", { exact: true }).selectOption({ label: "Planning" });
    const planningRead = page.locator('input[type="checkbox"][value="backoffice.planning.read"]');
    await planningRead.uncheck();
    await expect(page.locator('input[type="checkbox"][value="backoffice.functions.get_planboard"]')).not.toBeChecked();
    await page.getByRole("button", { name: "Rechten opslaan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rechten opslaan", exact: true })).toBeDisabled();
    await expect.poll(async () => Number((await db.query("select count(*) from private.management_role_permissions where role_id=$1 and capability='backoffice.planning.read'", [planningId])).rows[0].count)).toBe(0);
    await memberPage.goto("/app/planning");
    await expect(memberPage.getByRole("heading", { name: "Planbord", exact: true })).toHaveCount(0);
    await expect(memberPage.locator(".workspace-shell")).toHaveCount(0);
    for (const capability of initialPermissions) {
      const input = page.locator(`input[type="checkbox"][value="${capability}"]`);
      if (await input.count() && !(await input.isChecked()) && await input.isEnabled()) await input.check();
    }
    await page.getByRole("button", { name: "Rechten opslaan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rechten opslaan", exact: true })).toBeDisabled();
    await memberPage.goto("/app/planning");
    await expect(memberPage.getByRole("heading", { name: "Planbord", exact: true })).toBeVisible();

    // Assignment changes page access for the existing session as well.
    await page.getByRole("tab", { name: "Gebruikers", exact: true }).click();
    await page.reload();
    await page.getByLabel("Gebruikers zoeken", { exact: true }).fill(invitedEmail);
    await memberRow.getByRole("button", { name: `Rol van ${invitedName} wijzigen`, exact: true }).click();
    const roleDialog = page.getByRole("dialog", { name: `Managementrol van ${invitedName}`, exact: true });
    await roleDialog.getByRole("combobox", { name: "Managementrol", exact: true }).selectOption({ label: "Administratie" });
    await roleDialog.getByRole("button", { name: "Rol opslaan", exact: true }).click();
    await expect(roleDialog).toBeHidden();
    await expect(memberRow).toContainText("Administratie");
    await memberPage.goto("/app/planning");
    await expect(memberPage.getByRole("heading", { name: "Planbord", exact: true })).toHaveCount(0);
    await memberPage.goto("/app/facturen");
    await expect(memberPage.getByRole("heading", { name: "Facturen", exact: true })).toBeVisible();

    // Only an accepted, active member can receive ownership. The recipient's
    // real OTP session is still fresh; neither side gains platform authority.
    await page.getByRole("button", { name: "Eigenaarschap overdragen", exact: true }).click();
    const transfer = page.getByRole("dialog", { name: "Eigenaarschap overdragen", exact: true });
    const invitedMembership = (await db.query("select id from public.tenant_memberships where tenant_id=$1 and user_id=(select id from auth.users where email=$2)", [tenantId, invitedEmail])).rows[0].id;
    await transfer.getByRole("combobox", { name: "Nieuwe eigenaar", exact: true }).selectOption(invitedMembership);
    await expect(transfer.getByRole("button", { name: "Overdracht klaarzetten", exact: true })).toBeDisabled();
    await transfer.getByRole("checkbox", { name: "Ik wil het volledige eigenaarschap aan deze gebruiker overdragen.", exact: true }).check();
    await transfer.getByRole("button", { name: "Overdracht klaarzetten", exact: true }).click();
    await expect(transfer).toBeHidden();
    await expect(page.getByText("Eigendomsoverdracht wacht op acceptatie", { exact: true })).toBeVisible();
    await memberPage.goto("/app");
    await memberPage.getByRole("button", { name: "Overdracht bekijken", exact: true }).click();
    const accept = memberPage.getByRole("dialog", { name: "Eigenaarschap accepteren", exact: true });
    await accept.getByRole("checkbox", { name: "Ik accepteer het eigenaarschap van Demo Organisatie.", exact: true }).check();
    await accept.getByRole("button", { name: "Eigenaarschap accepteren", exact: true }).click();
    await expect(accept).toBeHidden();
    await expect.poll(async () => (await db.query("select r.code from private.management_members mm join private.management_roles r on r.id=mm.role_id where mm.membership_id=$1", [invitedMembership])).rows[0].code).toBe("owner");
    await expect.poll(async () => (await db.query("select r.code from private.management_members mm join private.management_roles r on r.id=mm.role_id join public.tenant_memberships m on m.id=mm.membership_id where m.tenant_id=$1 and m.user_id=$2", [tenantId, ownerId])).rows[0].code).toBe("management");
    await memberPage.goto("/app/gebruikers");
    await expect(memberPage.getByRole("button", { name: "Managementgebruiker uitnodigen", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Managementgebruiker uitnodigen", exact: true })).toHaveCount(0);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Goedendag, Demo Organisatie", exact: true })).toBeVisible();
    await memberPage.goto("/platform");
    await expect(memberPage.getByRole("complementary", { name: "Platformnavigatie", exact: true })).toHaveCount(0);
  } finally {
    await recipient.request.post("/auth/signout").catch(() => undefined);
    await recipient.close();
    try {
      if (planningId && initialPermissions.length) {
        await db.query("delete from private.management_role_permissions where tenant_id=$1 and role_id=$2", [tenantId, planningId]);
        await db.query("insert into private.management_role_permissions(tenant_id,role_id,capability) select $1,$2,unnest($3::text[])", [tenantId, planningId, initialPermissions]);
        await db.query("update private.management_roles set revision=$2 where id=$1", [planningId, planningRevision]);
      }
      const fixtureUsers: string[] = (await db.query("select id from auth.users where email=any($1::text[])", [[ownerEmail, invitedEmail]])).rows.map(row => row.id);
      if (tenantId && fixtureUsers.length) {
        // A separately seeded owner always remains. Do not delete a sole owner.
        const remainingOwners = (await db.query("select count(*) from private.management_members mm join private.management_roles r on r.id=mm.role_id join public.tenant_memberships m on m.id=mm.membership_id where m.tenant_id=$1 and r.code='owner' and m.status='active' and not(m.user_id=any($2::uuid[]))", [tenantId, fixtureUsers])).rows[0].count;
        if (Number(remainingOwners) === 0) throw new Error("Management fixture cleanup must preserve an active seeded owner");
        await db.query("delete from private.management_transfers where tenant_id=$1 and (source_membership in(select id from public.tenant_memberships where user_id=any($2::uuid[])) or target_membership in(select id from public.tenant_memberships where user_id=any($2::uuid[])))", [tenantId, fixtureUsers]);
        await db.query("delete from private.management_receipts where tenant_id=$1 and actor_id=any($2::uuid[])", [tenantId, fixtureUsers]);
        await db.query("delete from public.audit_events where tenant_id=$1 and actor_user_id=any($2::uuid[]) and action like 'management.%'", [tenantId, fixtureUsers]);
        await db.query("delete from public.mail_deliveries where tenant_id=$1 and recipient=$2", [tenantId, invitedEmail]);
        await db.query("delete from public.tenant_memberships where tenant_id=$1 and user_id=any($2::uuid[])", [tenantId, fixtureUsers]);
        for (const id of fixtureUsers) { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error("Could not remove isolated management fixture account"); }
      }
    } finally { await db.end(); }
  }
});
