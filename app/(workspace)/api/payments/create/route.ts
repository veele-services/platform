import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMolliePayment, getMolliePayment } from "@/lib/providers/mollie";
import { getServerEnv } from "@/lib/env/server";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { paymentAccess } from "@/lib/payments/access";
import { verifiedCheckout, verifiedPayment, verifiedStoredCheckout } from "@/lib/payments/provider-result";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";

export async function POST(request: Request) {
  try {
    const body = z.object({ token: z.string().min(20).max(256) }).parse(await readBoundedJson(request, 1024));
    const admin = createAdminClient();
    const access = await paymentAccess(admin, body.token);
    if (!access) return NextResponse.json({ error: "Betaallink is ongeldig of verlopen" }, { status: 404 });
    const { group, tenant, invoices } = access;
    if (group.status !== "open") return NextResponse.json({ error: "Deze betaalbundel is niet meer open" }, { status: 409 });
    if (!(await requestMatchesTenant(tenant.slug))) return NextResponse.json({ error: "Betaallink hoort bij een andere tenantomgeving" }, { status: 404 });
    if (invoices.every(invoice=>invoice.total_cents<=invoice.paid_cents)) return NextResponse.json({ error: "Deze facturen zijn al betaald" }, { status: 409 });
    const mode = getServerEnv().MOLLIE_API_KEY?.startsWith("live_") ? "live" : "test";
    const redirectUrl = new URL(tenantAppUrl(tenant.slug, `/pay/${body.token}`));
    redirectUrl.searchParams.set("return", "1");
    // One bounded replacement after a verified terminal provider response.
    // Allocation creation and reuse validation happen atomically under DB locks.
    for(let retry=0;retry<2;retry++) {
      const prepared=await admin.rpc("prepare_provider_payment",{payment_token_hash:createHash("sha256").update(body.token).digest("hex"),expected_mode:mode});
      if(prepared.error||!prepared.data)throw new Error("Betaalverdeling is niet beschikbaar");
      const attempt=prepared.data;
      if(attempt.provider!=="mollie"||attempt.tenant_id!==group.tenant_id||attempt.invoice_group_id!==group.id||attempt.provider_mode!==mode||attempt.currency!=="EUR"||!Number.isSafeInteger(attempt.amount_cents)||attempt.amount_cents<=0)throw new Error("Ongeldige betaalpoging");
      if (!(await paymentAccess(admin, body.token))) return NextResponse.json({ error: "Betaallink is niet meer beschikbaar" }, { status: 404 });
      const leaseId=randomUUID();
      const claim=await admin.rpc("claim_provider_payment_check",{target_attempt:attempt.id,lease_id:leaseId});
      if(claim.error)throw claim.error;
      const instruction=claim.data as {action?:string;retryAfter?:number};
      if(instruction.action==="reuse")return NextResponse.json({checkoutUrl:verifiedStoredCheckout(attempt.checkout_url)});
      if(instruction.action!=="provider")return NextResponse.json({error:"De betaalstatus wordt al gecontroleerd. Probeer zo opnieuw."},{status:429,headers:{"retry-after":String(Math.max(1,instruction.retryAfter??2))}});
      let payment,settled;
      try {
        payment = attempt.provider_payment_id ? await getMolliePayment(attempt.provider_payment_id) :
          await createMolliePayment({ amountCents: attempt.amount_cents, description: `Fieldgrid · ${invoices.map((invoice) => invoice.invoice_number).join(", ")}`.slice(0, 255), redirectUrl: redirectUrl.toString(), metadata: { payment_attempt_id: attempt.id, invoice_group_id: group.id, tenant_id: group.tenant_id }, idempotencyKey:attempt.idempotency_key });
        verifiedPayment(payment, attempt);
        // Never let a late checkout response revert a webhook settlement.
        if (!attempt.provider_payment_id) {
          const stored = await admin.from("payment_attempts").update({ provider_payment_id: payment.id,
            checkout_url: ["open", "pending"].includes(payment.status) ? verifiedCheckout(payment) : null,
            provider_payload: payment as never, last_checked_at: new Date().toISOString() })
            .eq("tenant_id", group.tenant_id).eq("id", attempt.id).is("provider_payment_id", null);
          if (stored.error) throw stored.error;
        }
        settled = await admin.rpc("apply_confirmed_provider_payment", { target_payment_attempt_id: attempt.id,
          provider_payment_id: payment.id, provider_status: payment.status, provider_amount_cents: attempt.amount_cents,
          provider_currency: payment.amount.currency, provider_payload: payment as never });
        if (settled.error) throw settled.error;
      } finally {
        await admin.rpc("release_provider_payment_check",{target_attempt:attempt.id,lease_id:leaseId});
      }
      if (!(await paymentAccess(admin, body.token))) return NextResponse.json({ error: "Betaallink is niet meer beschikbaar" }, { status: 404 });
      if(payment.status==="paid"||settled.data?.status==="paid")return NextResponse.json({error:"Deze betaling is verwerkt. Ververs de factuurstatus."},{status:409});
      if (["open", "pending"].includes(payment.status)) return NextResponse.json({checkoutUrl:verifiedCheckout(payment)});
    }
    return NextResponse.json({error:"De betaalprovider kon geen nieuwe betaling openen. Probeer later opnieuw."},{status:409});
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return NextResponse.json({ error: "Aanvraag is te groot" }, { status: 413 });
    return NextResponse.json({ error: "Betaling kon niet veilig worden gestart. Probeer opnieuw of neem contact op." }, { status: 400 });
  }
}
