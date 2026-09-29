import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMolliePayment } from "@/lib/providers/mollie";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const paymentId = form.get("id");
    if (typeof paymentId !== "string" || !paymentId.startsWith("tr_")) return new NextResponse(null, { status: 200 });
    const admin = createAdminClient();
    const { data: attempt } = await admin.from("payment_attempts").select("*").eq("provider", "mollie").eq("provider_payment_id", paymentId).maybeSingle();
    if (!attempt) return new NextResponse(null, { status: 200 });
    const payment = await getMolliePayment(paymentId);
    const amountCents = Math.round(Number(payment.amount.value) * 100);
    const status = payment.status === "canceled" ? "canceled" : payment.status;
    const { error } = await admin.rpc("apply_confirmed_provider_payment", { target_payment_attempt_id: attempt.id, provider_payment_id: payment.id, provider_status: status, provider_amount_cents: amountCents, provider_currency: payment.amount.currency, provider_payload: payment as never });
    if (error) throw error;
    return new NextResponse(null, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Tijdelijke verwerkingsfout" }, { status: 503 });
  }
}
