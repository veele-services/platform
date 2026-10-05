import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("config-only platform user selects an authorized tenant, saves, reloads and re-edits its exact policy", async ({ page }) => {
  test.setTimeout(120000);
  const dbUrl = requireLocalDatabaseUrl(), apiUrl = requireLocalApiUrl();
  const tenantId = randomUUID(), otherTenantId = randomUUID(), fixture = randomUUID();
  const label = `Beleidsorganisatie ${fixture.slice(0, 8)}`, otherLabel = `AFGESCHERMD-${fixture.slice(0, 8)}`;
  const email = `policy-${fixture}@notification-browser.test`, password = "Fieldgrid-E2E-2026";
  const db = new pg.Client({ connectionString: dbUrl.href }); await db.connect();
  const admin = createClient<Database>(apiUrl.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = createClient<Database>(apiUrl.href, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  // Platform's null tenant is intentional; generated RPC argument types do not
  // express SQL-nullable function parameters.
  const rpc = client.rpc.bind(client) as unknown as (name: "notification_query" | "notification_command", args: Record<string, unknown>) => Promise<{ error: { code: string } | null }>;
  let userId: string | undefined;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error("Policy fixture user creation failed"); userId = created.data.user.id;
    for (const [id, name] of [[tenantId, label], [otherTenantId, otherLabel]]) {
      await db.query("insert into public.tenants(id,name,slug) values($1,$2,$3)", [id, name, `policy-ui-${id}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning'])", [id]);
    }
    // No platform_admin row, membership, content, delivery or sender grant.
    await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,'platform.notifications.manage_tenant',$2)", [userId, { tenant_ids: [tenantId] }]);
    expect((await db.query("select capability from public.permission_grants where user_id=$1", [userId])).rows.map(r => r.capability)).toEqual(["platform.notifications.manage_tenant"]);
    expect((await db.query("select count(*)::int n from public.platform_admins where user_id=$1", [userId])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.tenant_memberships where user_id=$1", [userId])).rows[0].n).toBe(0);

    const path = "/platform/notificaties?tab=tenants";
    await authenticateWorkspace(page, email, path, password);
    await expect(page).toHaveURL(new RegExp("/platform/notificaties\\?tab=tenants$"));
    await expect(page.getByRole("heading", { name: "Tenantbeleid openen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nieuwe notificatie", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Aflevering", exact: true })).toHaveCount(0);
    const selector = page.getByRole("navigation", { name: "Toegestane tenants" });
    await expect(selector.getByRole("link")).toHaveCount(1); await expect(page.getByText(otherLabel, { exact: true })).toHaveCount(0);
    await page.getByLabel("Tenant zoeken").fill("niet-bestaande-fixture"); await expect(selector.getByRole("link")).toHaveCount(0);
    await page.getByLabel("Tenant zoeken").fill(label); await selector.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`tenantId=${tenantId}$`));
    await expect(page.getByRole("heading", { name: `Effectief beleid: ${label}`, exact: true })).toBeVisible();
    await expect(selector.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Instelling toevoegen", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Notificatiebeleid aanpassen", exact: true });
    await expect(editor.getByLabel("Tenant", { exact: true })).toHaveValue(tenantId);
    await expect(editor.getByLabel("Tenant", { exact: true })).toBeDisabled();
    await editor.getByLabel("Werkruimte", { exact: true }).selectOption("staff");
    await editor.getByLabel("Notificatietype", { exact: true }).selectOption("announcement.published");
    await editor.getByLabel("Kanaal", { exact: true }).selectOption("push");
    await editor.getByLabel("Instelling", { exact: true }).selectOption("off");
    const impact = editor.getByRole("region", { name: "Gevolgen van deze beleidswijziging", exact: true });
    await expect(impact).toContainText("Actieve tenants binnen dit bereik: 1");
    await expect(impact).toContainText("Offerte- en factuurmail valt niet binnen deze selectie.");
    await expect(impact).toContainText("jouw huidige ingelogde account");
    await expect(impact).toContainText("Geplande en wachtende meldingen binnen dit bereik worden onderdrukt");
    await editor.getByLabel("Reden", { exact: true }).fill("Fictieve configuratie voor uitsluitend deze organisatie.");
    page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Beleid opslaan", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Uitschakeling bevestigd");
    await expect(editor.getByText("Beleidsversie: 1", { exact: false })).toBeVisible();
    const first = (await db.query("select id,revision,mode,context,type_code,channel from private.notification_policies where tenant_id=$1 and scope='platform' and type_code='announcement.published' and context='staff' and channel='push'", [tenantId])).rows[0];
    expect(first).toMatchObject({ mode: "off", context: "staff", type_code: "announcement.published", channel: "push" }); expect(Number(first.revision)).toBe(1);
    // A successful save is clean: closing must not ask to discard saved input.
    await editor.getByRole("button", { name: "Sluiten", exact: true }).click(); await expect(editor).toHaveCount(0);
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: label }).filter({ hasText: "Nieuw teambericht" });
    await expect(row).toHaveCount(1); await expect(row.getByRole("cell", { name: "Uit", exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Aanpassen", exact: true }).click();
    for (const field of ["Bereik", "Tenant", "Werkruimte", "Notificatietype", "Kanaal"]) await expect(editor.getByLabel(field, { exact: true })).toBeDisabled();
    await expect(editor.getByLabel("Notificatietype", { exact: true })).toHaveValue("announcement.published");
    await expect(editor.getByLabel("Instelling", { exact: true })).toHaveValue("off");
    await editor.getByLabel("Instelling", { exact: true }).selectOption("on");
    await editor.getByLabel("Reden", { exact: true }).fill("Fictieve heropening met de herladen beleidsversie.");
    await editor.getByRole("button", { name: "Beleid opslaan", exact: true }).click(); await expect(editor.getByRole("status")).toContainText("Beleid opgeslagen");
    await editor.getByRole("button", { name: "Sluiten", exact: true }).click(); await page.reload();
    const saved = (await db.query("select id,revision,mode from private.notification_policies where id=$1 and tenant_id=$2", [first.id, tenantId])).rows[0];
    expect(saved.id).toBe(first.id); expect(Number(saved.revision)).toBe(2); expect(saved.mode).toBe("on");
    await expect(row.getByRole("cell", { name: "Aan", exact: true })).toBeVisible();

    const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw new Error("Policy fixture authentication failed");
    const stale = await rpc("notification_command", { target_tenant: null, actor_context: "platform", command: "policy_save", payload: { id: first.id, expected_revision: 1, scope: "platform", tenant_id: tenantId, context: "staff", type_code: "announcement.published", channel: "push", mode: "off", reason: "Fictieve achterhaalde editor" }, request_id: randomUUID() });
    expect(stale.error?.code).toBe("40001");
    for (const operation of ["campaigns", "recipients", "templates", "deliveries"]) {
      const denied = await rpc("notification_query", { target_tenant: null, actor_context: "platform", operation, payload: { criteria: { kind: "management", tenant_ids: [tenantId] } } }); expect(denied.error?.code).toBe("42501");
    }
    const deniedTenant = await rpc("notification_query", { target_tenant: null, actor_context: "platform", operation: "rules", payload: { tenant_id: otherTenantId } }); expect(deniedTenant.error?.code).toBe("42501");
    await page.goto(`/platform/notificaties?tab=tenants&tenantId=${otherTenantId}`);
    await expect(page.getByRole("heading", { name: "Deze pagina bestaat niet." })).toBeVisible();
    await expect(page.getByText(otherLabel, { exact: true })).toHaveCount(0);
  } finally {
    await client.auth.signOut();
    try {
      // Only these newly-created fixture tenants and this actor are removed.
      const tables = (await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private') and table_name in(select tablename from pg_tables where schemaname in ('public','private'))")).rows;
      await db.query("begin");
      try {
        await db.query("set local session_replication_role='replica'");
        await db.query("delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=any($1::uuid[]))", [[tenantId, otherTenantId]]);
        for (const row of tables) { expect(row.table_schema).toMatch(/^(public|private)$/); expect(row.table_name).toMatch(/^[a-z_]+$/); await db.query(`delete from "${row.table_schema}"."${row.table_name}" where tenant_id=any($1::uuid[])`, [[tenantId, otherTenantId]]); }
        if (userId) { await db.query("delete from private.notification_receipts where actor_id=$1", [userId]); await db.query("delete from private.notification_audit where actor_id=$1", [userId]); await db.query("delete from public.permission_grants where user_id=$1", [userId]); }
        await db.query("delete from public.tenants where id=any($1::uuid[])", [[tenantId, otherTenantId]]); await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
      if (userId) { const removed = await admin.auth.admin.deleteUser(userId); if (removed.error) throw new Error("Policy fixture cleanup failed"); }
    } finally { await db.end(); }
  }
});
