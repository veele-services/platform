"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { requestMatchesTenant } from "@/lib/tenancy/request";

export async function acceptQuote(formData: FormData): Promise<ActionResult> {
  try {
    const input = z.object({ token: z.string().min(20), name: z.string().trim().min(2), accepted: z.literal("on") }).parse(Object.fromEntries(formData));
    const hash = createHash("sha256").update(input.token).digest("hex");
    const admin = createAdminClient();
    const { data: access } = await admin.from("external_action_tokens").select("*").eq("token_hash", hash).eq("purpose", "quote_acceptance").is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!access) throw new Error("Deze akkoordlink is ongeldig of verlopen");
    const { data: tenant } = await admin.from("tenants").select("slug").eq("id", access.tenant_id).single();
    if (!tenant || !(await requestMatchesTenant(tenant.slug))) throw new Error("Deze link hoort bij een andere tenantomgeving");
    const { data: quote, error } = await admin.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by_name: input.name, acceptance_channel: "secure_link", acceptance_evidence: "explicit_checkbox" }).eq("id", access.subject_id).eq("status", "awaiting_acceptance").select().single();
    if (error) throw error;
    await admin.from("requests").update({ status: "accepted" }).eq("id", quote.request_id);
    await admin.from("external_action_tokens").update({ consumed_at: new Date().toISOString() }).eq("id", access.id);
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}
