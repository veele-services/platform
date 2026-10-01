"use server";

import {flushCommercialMail} from "@/lib/commercial/mail";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { message } from "@/lib/actions/result";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { commercialModuleEnabled } from "@/lib/commercial/access";

export type BookingState = { ok?: boolean; error?: string };

export async function bookAppointment(rawToken: string, _: BookingState, formData: FormData): Promise<BookingState> {
  try {
    const tokenValue = z.string().min(32).parse(rawToken);
    const slotId = z.string().uuid().parse(formData.get("slotId"));
    const admin = createAdminClient();
    const hash = createHash("sha256").update(tokenValue).digest("hex");
    const { data: token, error } = await admin.from("external_action_tokens").select("*").eq("token_hash", hash).eq("purpose", "booking").is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error || !token) throw new Error("Deze boekingslink is ongeldig of verlopen");
    const { data: tenant } = await admin.from("tenants").select("slug").eq("status","active").eq("id", token.tenant_id).single();
    if (!tenant || !await commercialModuleEnabled(admin,token.tenant_id) || !(await requestMatchesTenant(tenant.slug))) throw new Error("Deze link is niet beschikbaar");
    const { error: bookingError } = await admin.rpc("book_appointment_slot", { target_tenant_id: token.tenant_id, target_request_id: token.subject_id, target_slot_id: slotId, target_token_id: token.id });
    if (bookingError) throw new Error(bookingError.code==="23514"?bookingError.message:"Deze boeking kon niet worden bevestigd. Controleer de aangeboden link.");
    const order=token.work_order_id?await admin.from("work_orders").select("request_id,quote_id").eq("tenant_id",token.tenant_id).eq("id",token.work_order_id).single():null;
    await flushCommercialMail(token.tenant_id,order?.data?.quote_id||order?.data?.request_id||token.subject_id).catch(()=>{});
    return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
