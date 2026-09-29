import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMolliePayment } from "@/lib/providers/mollie";
import { getServerEnv } from "@/lib/env/server";
import { paymentAllocations } from "@/lib/domain/payments";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { requestMatchesTenant } from "@/lib/tenancy/request";

export async function POST(request: Request) {
  try {
    const body = z.object({ token: z.string().min(20) }).parse(await request.json());
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const admin = createAdminClient();
    const { data: access } = await admin.from("external_action_tokens").select("*").eq("token_hash", tokenHash).eq("purpose", "payment").is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!access) return NextResponse.json({ error: "Betaallink is ongeldig of verlopen" }, { status: 404 });
    const { data: group, error: groupError } = await admin.from("invoice_groups").select("*").eq("id", access.subject_id).single();
    if (groupError || group.status !== "open") throw groupError ?? new Error("Betaalgroep is niet open");
    const { data: tenant } = await admin.from("tenants").select("slug").eq("id", group.tenant_id).single();
    if (!tenant || !(await requestMatchesTenant(tenant.slug))) return NextResponse.json({ error: "Betaallink hoort bij een andere tenantomgeving" }, { status: 404 });
    const { data: items, error: itemsError } = await admin.from("invoice_group_items").select("invoice_id").eq("invoice_group_id", group.id);
    if (itemsError || !items.length) throw itemsError ?? new Error("Geen facturen geselecteerd");
    const { data: invoices, error: invoiceError } = await admin.from("invoices").select("*").in("id", items.map((item) => item.invoice_id));
    if (invoiceError) throw invoiceError;
    const { allocations, totalCents: total } = paymentAllocations(invoices.map((invoice) => ({ id: invoice.id, totalCents: invoice.total_cents, paidCents: invoice.paid_cents })));
    if (total <= 0) return NextResponse.json({ error: "Deze facturen zijn al betaald" }, { status: 409 });
    const idempotencyKey = `mollie-${group.id}-${total}`;
    const existing = await admin.from("payment_attempts").select("*").eq("tenant_id", group.tenant_id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.data?.checkout_url && ["open", "pending"].includes(existing.data.status)) return NextResponse.json({ checkoutUrl: existing.data.checkout_url });
    const mode = getServerEnv().MOLLIE_API_KEY?.startsWith("live_") ? "live" : "test";
    let attempt = existing.data;
    if (!attempt) {
      const { data: inserted, error: attemptError } = await admin.from("payment_attempts").insert({ id: randomUUID(), tenant_id: group.tenant_id, invoice_group_id: group.id, provider: "mollie", provider_mode: mode, status: "open", amount_cents: total, currency: "EUR", idempotency_key: idempotencyKey }).select().single();
      if (attemptError) throw attemptError;
      attempt = inserted;
      const { error: allocationError } = await admin.from("payment_allocations").insert(allocations.map((allocation) => ({ tenant_id: group.tenant_id, payment_attempt_id: attempt!.id, invoice_id: allocation.invoiceId, amount_cents: allocation.amountCents })));
      if (allocationError) throw allocationError;
    }
    const redirectUrl = new URL(tenantAppUrl(tenant.slug, `/pay/${body.token}`));
    redirectUrl.searchParams.set("return", "1");
    const payment = await createMolliePayment({ amountCents: total, description: `Fieldgrid · ${invoices.map((invoice) => invoice.invoice_number).join(", ")}`.slice(0, 255), redirectUrl: redirectUrl.toString(), metadata: { payment_attempt_id: attempt.id, invoice_group_id: group.id, tenant_id: group.tenant_id }, idempotencyKey });
    const checkoutUrl = payment._links?.checkout?.href;
    if (!checkoutUrl) throw new Error("Mollie gaf geen checkout-URL terug");
    await admin.from("payment_attempts").update({ provider_payment_id: payment.id, provider_mode: payment.mode, status: payment.status, checkout_url: checkoutUrl, provider_payload: payment as never, last_checked_at: new Date().toISOString() }).eq("id", attempt.id);
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Betaling kon niet worden gestart" }, { status: 400 });
  }
}
