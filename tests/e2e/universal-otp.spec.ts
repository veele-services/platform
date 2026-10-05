import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { signInWithEmailOtp } from "./login-auth";

// Real one-use codes must not be retained in any Playwright artifact.
test.use({ trace: "off", screenshot: "off", video: "off" });

const fixture = randomUUID();
const customer = randomUUID(), contact = randomUUID(), object = randomUUID();
const emails = {
  management: `otp-management-${fixture}@fieldgrid.test`,
  platform: `otp-platform-${fixture}@fieldgrid.test`,
  customer: `otp-customer-${fixture}@fieldgrid.test`,
};
const users: Partial<Record<keyof typeof emails, string>> = {};
let tenant = "", db: pg.Client;
let admin: ReturnType<typeof createClient<Database>>;

test.beforeAll(async () => {
  const api = requireLocalApiUrl(), database = requireLocalDatabaseUrl();
  db = new pg.Client({ connectionString: database.href });
  await db.connect();
  admin = createClient<Database>(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const current = await db.query("select id from public.tenants where slug='fieldgrid-e2e' and status='active'");
  if (current.rows.length !== 1) throw new Error("The isolated local OTP tenant fixture is unavailable");
  tenant = current.rows[0].id;
  for (const role of Object.keys(emails) as Array<keyof typeof emails>) {
    const created = await admin.auth.admin.createUser({ email: emails[role], email_confirm: true });
    if (created.error || !created.data.user) throw new Error("The isolated local OTP user fixture could not be created");
    users[role] = created.data.user.id;
  }
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')", [tenant, users.management]);
  await db.query("insert into public.platform_admins(user_id) values($1)", [users.platform]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,$1::uuid::text,'Fictieve OTP klant',$3)", [customer, tenant, emails.customer]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,phone) values($1,$2,$3,'Fictieve OTP contactpersoon',$4,'0301234567')", [contact, tenant, customer, emails.customer]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'Fictieve OTP locatie','{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\",\"country\":\"NL\"}')", [object, tenant, customer]);
  await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)", [tenant, object, users.customer, users.management]);
  const attached = await db.query("update public.customer_portal_accounts set contact_id=$4 where tenant_id=$1 and customer_id=$2 and user_id=$3 returning id", [tenant, customer, users.customer, contact]);
  if (attached.rows.length !== 1) throw new Error("The exact local OTP customer account fixture is unavailable");
  // The customer has no staff/management membership; the platform admin has
  // no tenant membership. Successful login must not infer either permission.
  expect((await db.query("select count(*)::int n from public.tenant_memberships where user_id=any($1::uuid[])", [[users.customer, users.platform]])).rows[0].n).toBe(0);
});

test.afterAll(async () => {
  if (!db) return;
  try {
    requireLocalDatabaseUrl();
    if (tenant) {
      await db.query("delete from private.customer_portal_commands where tenant_id=$1 and actor_id=$2", [tenant, users.customer]);
      await db.query("delete from public.customer_portal_accounts where tenant_id=$1 and customer_id=$2 and user_id=$3", [tenant, customer, users.customer]);
      await db.query("delete from public.object_customer_bindings where tenant_id=$1 and object_id=$2 and user_id=$3", [tenant, object, users.customer]);
      await db.query("delete from public.object_history where tenant_id=$1 and object_id=$2", [tenant, object]);
      await db.query("delete from public.objects where tenant_id=$1 and id=$2", [tenant, object]);
      await db.query("delete from public.customer_contacts where tenant_id=$1 and id=$2", [tenant, contact]);
      await db.query("delete from public.customers where tenant_id=$1 and id=$2", [tenant, customer]);
      await db.query("delete from public.tenant_memberships where tenant_id=$1 and user_id=$2", [tenant, users.management]);
    }
    if (users.platform) await db.query("delete from public.platform_admins where user_id=$1", [users.platform]);
    for (const id of Object.values(users)) {
      const removed = await admin.auth.admin.deleteUser(id!);
      if (removed.error) throw new Error("The exact local OTP user fixture could not be removed");
    }
  } finally { await db.end(); }
});

test("management zonder platformrol logt met een echte e-mailcode in op de backoffice", async ({ page }) => {
  await page.context().addCookies([{ name: "fieldgrid_tenant_id", value: tenant, url: "http://127.0.0.1:3000" }]);
  await signInWithEmailOtp(page, emails.management, "/app");
  await expect(page.getByRole("link", { name: "Klanten", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Code controleren", exact: true })).toHaveCount(0);
});

test("platformbeheerder zonder tenantlidmaatschap logt met een echte e-mailcode in op het platform", async ({ page }) => {
  await signInWithEmailOtp(page, emails.platform, "/platform");
  await expect(page.getByRole("heading", { name: "Grip op iedere tenant.", exact: true })).toBeVisible();
});

test("klant zonder personeelslidmaatschap logt met een echte e-mailcode in op uitsluitend het eigen klantportaal", async ({ page }) => {
  await page.context().addCookies([{ name: "fieldgrid_tenant_id", value: tenant, url: "http://127.0.0.1:3000" }]);
  await signInWithEmailOtp(page, emails.customer, "/klant");
  await expect(page.locator(".customer-portal")).toBeVisible();
  await expect(page.getByText("Fictieve OTP klant", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Fictieve OTP locatie", { exact: true })).toBeVisible();
});
