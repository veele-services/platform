"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantMerchant } from "@/lib/payments/merchant";
import { createMolliePayment, getMolliePayment } from "@/lib/providers/mollie";
import { verifiedCheckout, verifiedPayment, verifiedStoredCheckout } from "@/lib/payments/provider-result";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { revalidatePath } from "next/cache";

const inputSchema = z.object({ accountId: z.uuid(), invoiceIds: z.array(z.uuid()).min(1).max(50), commandId: z.uuid() }).strict();
export async function startCustomerPayment(input: unknown) {
  try {
    const value = inputSchema.parse(input), actor = await getObjectActor();
    // Validate customer scope before provider I/O. The mutation rechecks the
    // same scope after provider verification and before returning any checkout.
    const scope = await actor.db.rpc("customer_portal_invoices", { target_tenant: actor.tenant.id, target_account: value.accountId });
    const ids = new Set(z.array(z.object({ id: z.uuid() })).parse(scope.data).map(i => i.id));
    if (scope.error || value.invoiceIds.some(id => !ids.has(id))) throw new Error("Geen toegang");
    const merchant = await requireTenantMerchant(actor.tenant.id);
    const args = { target_tenant: actor.tenant.id, target_account: value.accountId, invoice_ids: value.invoiceIds,
      request_id: value.commandId, expected_mode: merchant.mode, expected_profile: merchant.profileId };
    const prepared = await actor.db.rpc("customer_portal_payment_prepare", args);
    if (prepared.error || !prepared.data) return { ok: false as const, error: "Deze facturen zijn gewijzigd of er wordt al een betaling verwerkt. Vernieuw het overzicht." };
    const admin = createAdminClient();
    const lookup = await admin.from("payment_attempts").select("*").eq("tenant_id", actor.tenant.id).eq("id", prepared.data).single();
    if (lookup.error || !lookup.data) throw new Error("Betaalpoging ontbreekt");
    const attempt = lookup.data;
    if (attempt.tenant_id !== actor.tenant.id || attempt.merchant_profile_id !== merchant.profileId || attempt.provider_mode !== merchant.mode ||
        !attempt.invoice_group_id || !Number.isSafeInteger(attempt.amount_cents) || attempt.amount_cents <= 0) throw new Error("Ongeldige betaling");
    if (attempt.status === "paid") return { ok: true as const, settled: true as const };
    if (!["open", "pending"].includes(attempt.status)) return { ok: false as const, error: "Deze betaalpoging is afgesloten. Vernieuw het overzicht en probeer opnieuw." };
    const lease = randomUUID();
    const claim = await admin.rpc("claim_provider_payment_check", { target_attempt: attempt.id, lease_id: lease });
    if (claim.error) throw claim.error;
    const instruction = claim.data as { action?: string };
    if (instruction.action === "reuse") {
      const recheck = await actor.db.rpc("customer_portal_payment_prepare", args);
      if (recheck.error) throw recheck.error;
      const current = await admin.from("payment_attempts").select("status,checkout_url").eq("tenant_id", actor.tenant.id).eq("id", attempt.id).single();
      if (current.error || !current.data) throw new Error("Betaalpoging ontbreekt");
      if (current.data.status === "paid") return { ok: true as const, settled: true as const };
      if (!["open", "pending"].includes(current.data.status)) throw new Error("Betaalpoging afgesloten");
      return { ok: true as const, checkoutUrl: verifiedStoredCheckout(current.data.checkout_url) };
    }
    if (instruction.action !== "provider") return { ok: false as const, error: "De betaalstatus wordt gecontroleerd. Probeer over enkele seconden opnieuw." };
    try {
      const redirect = new URL(tenantAppUrl(actor.tenant.slug, "/klant"));
      redirect.searchParams.set("account", value.accountId); redirect.searchParams.set("view", "invoices"); redirect.searchParams.set("payment", "return");
      const payment = attempt.provider_payment_id ? await getMolliePayment(attempt.provider_payment_id) : await createMolliePayment({
        amountCents: attempt.amount_cents, description: `${actor.tenant.name} · factuurbetaling`, redirectUrl: redirect.toString(),
        metadata: { tenant_id: actor.tenant.id, invoice_group_id: attempt.invoice_group_id, payment_attempt_id: attempt.id }, idempotencyKey: attempt.idempotency_key,
      });
      verifiedPayment(payment, attempt);
      if (payment.profileId !== merchant.profileId) throw new Error("Onjuiste betaalontvanger");
      if (!attempt.provider_payment_id) {
        const stored = await admin.from("payment_attempts").update({ provider_payment_id: payment.id, checkout_url: ["open", "pending"].includes(payment.status) ? verifiedCheckout(payment) : null,
          provider_payload: payment as never, last_checked_at: new Date().toISOString() }).eq("tenant_id", actor.tenant.id).eq("id", attempt.id).is("provider_payment_id", null);
        if (stored.error) throw stored.error;
      }
      const settled = await admin.rpc("apply_confirmed_provider_payment", { target_payment_attempt_id: attempt.id, provider_payment_id: payment.id,
        provider_status: payment.status, provider_amount_cents: attempt.amount_cents, provider_currency: payment.amount.currency, provider_payload: payment as never });
      if (settled.error) throw settled.error;
      const recheck = await actor.db.rpc("customer_portal_payment_prepare", args);
      if (recheck.error) throw recheck.error;
      revalidatePath("/klant", "layout"); revalidatePath("/app", "layout");
      if (payment.status === "paid" || settled.data?.status === "paid") return { ok: true as const, settled: true as const };
      if (["open", "pending"].includes(payment.status)) return { ok: true as const, checkoutUrl: verifiedCheckout(payment) };
      return { ok: false as const, error: "De betaling is niet voltooid. Vernieuw het overzicht en start desgewenst een nieuwe poging." };
    } finally {
      await admin.rpc("release_provider_payment_check", { target_attempt: attempt.id, lease_id: lease });
    }
  } catch {
    return { ok: false as const, error: "Online betalen is momenteel niet beschikbaar. Er is geen betaling bevestigd. Probeer later opnieuw of neem contact op." };
  }
}
