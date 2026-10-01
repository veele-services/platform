import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Shared by the invoice view and checkout creation; GET never consumes a link. */
export async function paymentAccess(admin: SupabaseClient<Database>, token: string) {
  if (token.length < 20 || token.length > 256) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.from("external_action_tokens")
    .select("tenant_id,subject_id")
    .eq("token_hash", tokenHash).eq("purpose", "payment")
    .is("consumed_at", null).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  const [{ data: group, error: groupError }, { data: tenant }, { data: settings }] = await Promise.all([
    admin.from("invoice_groups").select("id,tenant_id,customer_id,status,expires_at").eq("id", data.subject_id).eq("tenant_id", data.tenant_id).maybeSingle(),
    admin.from("tenants").select("id,name,slug").eq("id", data.tenant_id).eq("status", "active").maybeSingle(),
    admin.from("tenant_settings").select("enabled_services").eq("tenant_id", data.tenant_id).maybeSingle(),
  ]);
  if (groupError || !group || !tenant || !settings?.enabled_services.includes("finance") ||
    !["open", "completed"].includes(group.status) || !group.expires_at || Date.parse(group.expires_at) <= Date.now()) return null;
  const { data: items, error: itemsError } = await admin.from("invoice_group_items").select("invoice_id")
    .eq("tenant_id", data.tenant_id).eq("invoice_group_id", group.id);
  if (itemsError || !items?.length) return null;
  const { data: invoices, error: invoiceError } = await admin.from("invoices")
    .select("id,tenant_id,customer_id,invoice_number,total_cents,paid_cents,status")
    .eq("tenant_id", data.tenant_id).eq("customer_id", group.customer_id).in("id", items.map(i => i.invoice_id));
  if (invoiceError || !invoices || invoices.length !== items.length || invoices.some(i => ["draft", "void", "credited"].includes(i.status))) return null;
  return { ...data, group, tenant, invoices };
}
