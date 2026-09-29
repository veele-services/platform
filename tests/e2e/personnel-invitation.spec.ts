import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

// Invitations contain one-use credentials. Never record browser/network traces.
test.use({ trace: "off", screenshot: "off", video: "off" });

type Mail = {
  subject: string; from: { email: string; name: string };
  content: Array<{ type: string; value: string }>;
  tracking_settings: { click_tracking: { enable: boolean }; open_tracking: { enable: boolean } };
};
const mailbox = "http://127.0.0.1:59329";
const password = "Fieldgrid-Invite-Test-2026";

async function fixture() {
  const url = new URL(process.env.SUPABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "59321") throw new Error("Invitation tests require local Fieldgrid Supabase");
  const admin = createClient<Database>(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenant, error } = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").single();
  if (error) throw new Error("Missing local test tenant");
  return { admin, tenant };
}

async function loginAdmin(page: Page) {
  await page.goto("/login?next=%2Fapp%2Fpersoneel");
  await page.getByLabel("E-mailadres").fill("platform-admin@fieldgrid.test");
  await page.getByLabel("Wachtwoord", { exact: true }).fill("Fieldgrid-E2E-2026");
  await page.getByRole("button", { name: /Inloggen/ }).click();
  await page.waitForURL("**/app/personeel");
}

async function invite(page: Page, email: string) {
  await page.getByRole("button", { name: "Nieuwe medewerker" }).click();
  const wizard = page.getByRole("dialog", { name: "Nieuwe medewerker" });
  await wizard.getByLabel("Volledige naam").fill("Robin de Vries");
  await wizard.getByLabel("E-mailadres").fill(email);
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await wizard.getByRole("button", { name: "Volgende" }).click();
  await expect(wizard).toContainText("personeelsportaal");
  await expect(wizard).not.toContainText("Supabase");
  await wizard.getByRole("button", { name: "Uitnodiging versturen" }).click();
  return wizard;
}

async function latestMail(email: string): Promise<Mail> {
  let mails: Mail[] = [];
  await expect.poll(async () => {
    mails = await (await fetch(`${mailbox}/messages?recipient=${encodeURIComponent(email)}`)).json();
    return mails.length > 0;
  }).toBe(true);
  return mails[mails.length - 1];
}

function activationUrl(mail: Mail): URL {
  const text = mail.content.find((item) => item.type === "text/plain")?.value ?? "";
  const raw = text.match(/http:\/\/127\.0\.0\.1:3000\/auth\/invite[^\s]+/)?.[0];
  if (!raw) throw new Error("Activation link is missing from invitation");
  return new URL(raw);
}

async function openInvitation(page: Page, url: URL) {
  // Do not include the credential in an error if navigation fails.
  try { await page.goto(url.href); } catch { throw new Error("Could not open local invitation"); }
  await expect.poll(() => page.evaluate(() => location.hash === "")).toBe(true);
  await expect.poll(() => page.locator('input[name="tokenHash"]').evaluate((node: HTMLInputElement) => node.value.length >= 32)).toBe(true);
}

async function cleanup(admin: Awaited<ReturnType<typeof fixture>>["admin"], tenantId: string, email: string, extraUserId?: string) {
  const { data: people } = await admin.from("personnel").select("id,user_id").eq("tenant_id", tenantId).eq("email", email);
  const users = new Set([...(people ?? []).flatMap((person) => person.user_id ? [person.user_id] : []), ...(extraUserId ? [extraUserId] : [])]);
  await admin.from("personnel").delete().eq("tenant_id", tenantId).eq("email", email);
  await admin.from("mail_deliveries").delete().eq("tenant_id", tenantId).eq("recipient", email);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}

test("branded personnel invitation activates once and opens the personnel portal", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const { admin, tenant } = await fixture();
  const email = `invite-${crypto.randomUUID()}@fieldgrid.test`;
  const recipient = await browser.newContext();
  const employee = await recipient.newPage();
  try {
    await loginAdmin(page);
    await expect(await invite(page, email)).toBeHidden();
    const mail = await latestMail(email);
    expect(mail.subject).toBe("Uitnodiging voor het personeelsportaal van Demo Organisatie");
    expect(mail.from.email).toBe("noreply@fieldgrid.test");
    expect(mail.tracking_settings.click_tracking.enable).toBe(false);
    expect(mail.tracking_settings.open_tracking.enable).toBe(false);
    const html = mail.content.find((item) => item.type === "text/html")!.value;
    expect(html.includes("/email-logo")).toBe(true);
    expect(html.includes("#C65D21") && html.includes("#214E72")).toBe(true);
    expect(html.includes("Supabase")).toBe(false);
    const url = activationUrl(mail);
    const token = new URLSearchParams(url.hash.slice(1)).get("token_hash")!;
    const { data: logs } = await admin.from("mail_deliveries").select("status,render_snapshot,branding_snapshot,last_error").eq("tenant_id", tenant.id).eq("recipient", email);
    expect(logs?.map((row) => row.status)).toEqual(["sent"]);
    expect(JSON.stringify(logs).includes(token)).toBe(false);

    // Visual acceptance uses a redacted, stable example, never a real token.
    const preview = await recipient.newPage();
    const { data: person } = await admin.from("personnel").select("employee_number").eq("tenant_id", tenant.id).eq("email", email).single();
    await preview.setViewportSize({ width: 800, height: 1100 });
    await preview.setContent(html.replaceAll(token, "voorbeeld-activatielink").replaceAll(person!.employee_number, "P-0100"));
    await expect(preview.getByRole("img", { name: "Demo Organisatie" })).toBeVisible();
    await expect(preview).toHaveScreenshot("personnel-invitation-email-800.png", { fullPage: true });
    await preview.setViewportSize({ width: 390, height: 844 });
    await expect(preview).toHaveScreenshot("personnel-invitation-email-390.png", { fullPage: true });
    await expect.poll(() => preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await preview.close();

    // A link scanner's GET must not consume the invitation.
    await employee.goto(url.origin + url.pathname + url.search);
    await expect(employee.getByRole("heading", { name: "Welkom bij Demo Organisatie" })).toBeVisible();
    await employee.goto("about:blank");
    await openInvitation(employee, url);
    await employee.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await employee.waitForURL("**/auth/reset?next=/staff&invite=1");
    await expect(employee.getByRole("heading", { name: "Kies je wachtwoord" })).toBeVisible();
    await employee.getByLabel("Nieuw wachtwoord").fill(password);
    await employee.getByRole("button", { name: "Wachtwoord opslaan" }).click();
    await employee.waitForURL("**/staff");
    await expect(employee.getByRole("heading", { name: "Planning", exact: true })).toBeVisible();
    await recipient.request.post("/auth/signout");
    await openInvitation(employee, url);
    await employee.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await expect(employee.locator(".auth-message[role='alert']")).toContainText("ongeldig, verlopen of al gebruikt");
    await employee.goto("/staff");
    await expect(employee.getByRole("button", { name: /Inloggen/ })).toBeVisible();
  } finally {
    await recipient.request.post("/auth/signout");
    await recipient.close();
    await cleanup(admin, tenant.id, email);
  }
});

test("existing accounts keep their password and roles when invited to the personnel portal", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const { admin, tenant } = await fixture();
  const email = `existing-${crypto.randomUUID()}@fieldgrid.test`;
  const { data: account, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("Could not create local existing-account fixture");
  const recipient = await browser.newContext();
  try {
    await admin.from("tenant_memberships").insert({ tenant_id: tenant.id, user_id: account.user.id, roles: ["management"], status: "active" });
    await loginAdmin(page);
    await expect(await invite(page, email)).toBeHidden();
    const mail = await latestMail(email);
    const text = mail.content.find((item) => item.type === "text/plain")!.value;
    expect(text.includes("Je wachtwoord blijft ongewijzigd")).toBe(true);
    expect(text.includes("http://127.0.0.1:3000/staff")).toBe(true);
    expect(text.includes("token_hash")).toBe(false);
    const { data: membership } = await admin.from("tenant_memberships").select("roles").eq("tenant_id", tenant.id).eq("user_id", account.user.id).single();
    expect(membership?.roles.sort()).toEqual(["management", "staff"]);
    const employee = await recipient.newPage();
    await employee.goto("/staff");
    await employee.getByLabel("E-mailadres").fill(email);
    await employee.getByLabel("Wachtwoord", { exact: true }).fill(password);
    await employee.getByRole("button", { name: /Inloggen/ }).click();
    await employee.waitForURL("**/staff");
    await expect(employee.getByRole("heading", { name: "Planning", exact: true })).toBeVisible();
  } finally {
    await recipient.request.post("/auth/signout");
    await recipient.close();
    await cleanup(admin, tenant.id, email, account.user.id);
  }
});

test("failed invitation can be resent without duplicating personnel and revoked access cannot activate", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const { admin, tenant } = await fixture();
  const email = `retry-${crypto.randomUUID()}@fieldgrid.test`;
  const recipient = await browser.newContext();
  try {
    await loginAdmin(page);
    await fetch(`${mailbox}/fail-next`, { method: "POST" });
    await expect(await invite(page, email)).toBeHidden();
    await expect(page.getByText(/De medewerker is aangemaakt\. De uitnodigingsmail kon niet worden verstuurd/)).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Meer", exact: true }).click();
    await page.getByRole("button", { name: "Uitnodiging opnieuw versturen" }).click();
    await expect(page.getByText("Uitnodiging opnieuw verstuurd", { exact: true })).toBeVisible();
    const url = activationUrl(await latestMail(email));
    const { data: people } = await admin.from("personnel").select("id,user_id").eq("tenant_id", tenant.id).eq("email", email);
    expect(people?.length).toBe(1);
    const { data: logs } = await admin.from("mail_deliveries").select("status").eq("tenant_id", tenant.id).eq("recipient", email);
    expect(logs?.map((log) => log.status).sort()).toEqual(["failed", "sent"]);
    // An outstanding link must not reinstate access revoked after delivery.
    await admin.from("tenant_memberships").update({ status: "suspended" }).eq("tenant_id", tenant.id).eq("user_id", people![0].user_id!);
    const employee = await recipient.newPage();
    await openInvitation(employee, url);
    await employee.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await expect(employee.locator(".auth-message[role='alert']")).toContainText("ongeldig, verlopen of al gebruikt");
    await employee.goto("/staff");
    await expect(employee.getByRole("button", { name: /Inloggen/ })).toBeVisible();
  } finally {
    await recipient.request.post("/auth/signout");
    await recipient.close();
    await cleanup(admin, tenant.id, email);
  }
});
