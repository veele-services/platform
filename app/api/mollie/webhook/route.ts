import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMolliePayment } from "@/lib/providers/mollie";
import { verifiedPayment } from "@/lib/payments/provider-result";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@/lib/http/request-body";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded"))
      return new NextResponse(null, { status: 415 });
    const form = new URLSearchParams((await readBoundedRequestBody(request, 1024)).toString("utf8"));
    const paymentId = form.get("id");
    if (!paymentId || form.getAll("id").length !== 1 || paymentId.length > 100 || !/^tr_[a-zA-Z0-9_-]+$/.test(paymentId)) return new NextResponse(null, { status: 200 });
    const admin = createAdminClient();
    const { data: attempt, error: lookupError } = await admin.from("payment_attempts").select("*").eq("provider", "mollie").eq("provider_payment_id", paymentId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!attempt) return new NextResponse(null, { status: 200 });
    const payment = await getMolliePayment(paymentId);
    const amountCents = verifiedPayment(payment, attempt);
    const status = payment.status === "canceled" ? "canceled" : payment.status;
    const { error } = await admin.rpc("apply_confirmed_provider_payment", { target_payment_attempt_id: attempt.id, provider_payment_id: payment.id, provider_status: status, provider_amount_cents: amountCents, provider_currency: payment.amount.currency, provider_payload: payment as never });
    if (error) throw error;
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return new NextResponse(null, { status: 413 });
    return NextResponse.json({ error: "Tijdelijke verwerkingsfout" }, { status: 503 });
  }
}
