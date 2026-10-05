import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import type { Database } from "../../lib/database.types";

const ADMIN_EMAIL = "platform-admin@fieldgrid.test";
const STAFF_EMAIL = "field-worker@fieldgrid.test";
const ONBOARDING_EMAIL = "new-field-worker@fieldgrid.test";
export const E2E_PASSWORD = "Fieldgrid-E2E-2026";

async function user(admin: ReturnType<typeof createClient<Database>>, email: string) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = listed.users.find((item) => item.email === email);
  if (existing) { await admin.auth.admin.updateUserById(existing.id, { password: E2E_PASSWORD, email_confirm: true }); return existing; }
  const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user;
}

export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Lokale Supabase-config ontbreekt voor E2E");
  const replay=process.env.FIELDGRID_LOCAL_REPLAY_DIR;
  if(replay&&(!/^\/tmp\/fieldgrid-release-migrations\.[A-Za-z0-9]+$/.test(replay)||!readFileSync(`${replay}/supabase/config.toml`,"utf8").includes('project_id = "fieldgrid-release-audit-20261001"')))throw new Error("Ongeldige lokale E2E-replayomgeving");
  if(new URL(url).hostname!=="127.0.0.1" || new URL(url).port!==(replay?"60321":"59321"))throw new Error("E2E fixtures require the isolated local Fieldgrid database");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await user(admin, ADMIN_EMAIL);
  const worker = await user(admin, STAFF_EMAIL);
  const onboardingWorker = await user(admin, ONBOARDING_EMAIL);
  await admin.from("platform_admins").upsert({ user_id: owner.id });
  let { data: tenant } = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").maybeSingle();
  if (!tenant) {
    const { data: tenantId, error } = await admin.rpc("provision_tenant", { tenant_name: "Demo Organisatie", tenant_slug: "fieldgrid-e2e", owner_user_id: owner.id, actor_user_id: owner.id });
    if (error) throw error;
    tenant = { id: tenantId };
  }
  const tenantId = tenant.id;
  const logoPath = `${tenantId}/logo.png`;
  const logo = Buffer.from("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", "base64");
  const { error: logoError } = await admin.storage.from("branding").upload(logoPath, logo, { contentType: "image/png", upsert: true });
  if (logoError) throw logoError;
  const { error: brandingError } = await admin.from("tenant_branding").update({ logo_path: logoPath, primary_color: "#214E72", accent_color: "#C65D21" }).eq("tenant_id", tenantId);
  if (brandingError) throw brandingError;
  const { error: settingsError } = await admin.from("tenant_settings").update({ white_label_enabled: false }).eq("tenant_id", tenantId);
  if (settingsError) throw settingsError;
  await admin.from("tenant_memberships").upsert({ tenant_id: tenantId, user_id: worker.id, roles: ["staff"], status: "active", activated_at: new Date().toISOString() }, { onConflict: "tenant_id,user_id" });
  await admin.from("tenant_memberships").upsert({ tenant_id: tenantId, user_id: onboardingWorker.id, roles: ["staff"], status: "active", activated_at: new Date().toISOString() }, { onConflict: "tenant_id,user_id" });
  await admin.from("personnel").upsert({ id: "e1000000-0000-4000-8000-000000000001", tenant_id: tenantId, user_id: worker.id, employee_number: "FG-001", full_name: "Robin de Vries", email: STAFF_EMAIL, status: "active", onboarding_step: 5, onboarding_completed_at: "2026-09-28T08:00:00.000Z" }, { onConflict: "tenant_id,id" });
  await admin.from("personnel").upsert({ id: "e1000000-0000-4000-8000-000000000002", tenant_id: tenantId, user_id: onboardingWorker.id, employee_number: "FG-002", full_name: "Sam Nieuw", email: ONBOARDING_EMAIL, mobile_phone: null, home_address: {}, alternate_departure_address: { street: "", postal_code: "", city: "", country: "NL", status: "missing" }, status: "active", availability_self_service_enabled: true, onboarding_step: 0, onboarding_completed_at: null, onboarding_draft: {} }, { onConflict: "tenant_id,id" });
  await admin.from("customers").upsert({ id: "e2000000-0000-4000-8000-000000000001", tenant_id: tenantId, customer_number: "KL-001", name: "Noordhaven Vastgoed", billing_email: "finance@customer.test", billing_address: { street: "Marktstraat 12", postal_code: "2511 AA", city: "Den Haag", country: "NL" } }, { onConflict: "tenant_id,id" });
  await admin.from("objects").upsert({ id: "e3000000-0000-4000-8000-000000000001", tenant_id: tenantId, customer_id: "e2000000-0000-4000-8000-000000000001", object_number: "OB-001", name: "Noordhaven Kantoor", address: { street: "Marktstraat 12", postal_code: "2511 AA", city: "Den Haag", country: "NL" } }, { onConflict: "tenant_id,id" });
  await admin.from("task_catalog").upsert({ id: "e4000000-0000-4000-8000-000000000001", tenant_id: tenantId, code: "SCH-001", discipline: "Onderhoud", name: "Periodieke controle" }, { onConflict: "tenant_id,id" });
  await admin.from("task_revisions").upsert({ id: "e5000000-0000-4000-8000-000000000001", tenant_id: tenantId, task_id: "e4000000-0000-4000-8000-000000000001", revision: 1, duration_minutes: 30, price_cents: 4500, vat_basis_points: 2100, unit: "task" }, { onConflict: "tenant_id,id" });
  await admin.from("work_orders").upsert({ id: "e6000000-0000-4000-8000-000000000001", tenant_id: tenantId, work_order_number: "WB-2030-001", customer_id: "e2000000-0000-4000-8000-000000000001", object_id: "e3000000-0000-4000-8000-000000000001", discipline: "Onderhoud", status: "released", planned_start_at: "2030-01-15T09:00:00.000Z", planned_end_at: "2030-01-15T09:30:00.000Z", projected_start_at: "2030-01-15T09:00:00.000Z", projected_end_at: "2030-01-15T09:30:00.000Z", created_by: owner.id }, { onConflict: "tenant_id,id" });
  await admin.from("work_order_tasks").upsert({ id: "e7000000-0000-4000-8000-000000000001", tenant_id: tenantId, work_order_id: "e6000000-0000-4000-8000-000000000001", task_revision_id: "e5000000-0000-4000-8000-000000000001", task_code: "SCH-001", task_name: "Periodieke controle", duration_minutes: 30, unit: "task", unit_price_cents: 4500, vat_basis_points: 2100 }, { onConflict: "tenant_id,id" });
  await admin.from("work_order_assignments").upsert({ id: "e8000000-0000-4000-8000-000000000001", tenant_id: tenantId, work_order_id: "e6000000-0000-4000-8000-000000000001", personnel_id: "e1000000-0000-4000-8000-000000000001", status: "released", planned_start_at: "2030-01-15T09:00:00.000Z", planned_end_at: "2030-01-15T09:30:00.000Z", projected_start_at: "2030-01-15T09:00:00.000Z", projected_end_at: "2030-01-15T09:30:00.000Z" }, { onConflict: "tenant_id,id" });
  await admin.from("dispatches").upsert({ tenant_id: tenantId, work_order_id: "e6000000-0000-4000-8000-000000000001", assignment_id: "e8000000-0000-4000-8000-000000000001", dispatched_by: owner.id, idempotency_key: "e2e-dispatch" }, { onConflict: "tenant_id,idempotency_key" });
  await admin.from("announcements").upsert({ id: "e9000000-0000-4000-8000-000000000001", tenant_id: tenantId, title: "Welkom in Fieldgrid", body: "Controleer vandaag je planning en werkrapport.", audience_roles: ["staff"], published_at: "2026-09-28T08:00:00.000Z", created_by: owner.id }, { onConflict: "tenant_id,id" });
}
