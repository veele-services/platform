import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl } from "./local-target";

export async function ticketModule(enabled: boolean) {
  const api = requireLocalApiUrl();
  const admin = createClient<Database>(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const tenant = await admin.from("tenants").select("id").eq("slug", "fieldgrid-e2e").single();
  expect(tenant.error).toBeNull();
  const tenantId = tenant.data!.id;
  const settings = await admin.from("tenant_settings").select("enabled_services").eq("tenant_id", tenantId).single();
  expect(settings.error).toBeNull();
  const original = settings.data!.enabled_services;
  const services = original.filter(service => service !== "tickets");
  if (enabled) services.push("tickets");
  const result = await admin.from("tenant_settings").update({ enabled_services: services }).eq("tenant_id", tenantId);
  expect(result.error).toBeNull();
  return async () => {
    const restored = await admin.from("tenant_settings").update({ enabled_services: original }).eq("tenant_id", tenantId);
    expect(restored.error).toBeNull();
  };
}
