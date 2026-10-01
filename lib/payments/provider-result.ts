import "server-only";
import type { MolliePayment } from "@/lib/providers/mollie";

export type PaymentIdentity = {
  id: string; tenant_id: string; invoice_group_id: string | null;
  provider: string; provider_payment_id: string | null; provider_mode: string;
  amount_cents: number; currency: string;
};

/** Only the authenticated provider response is evidence, never browser fields. */
export function verifiedPayment(payment: MolliePayment, attempt: PaymentIdentity) {
  const amount = payment.amount?.value;
  if (typeof amount !== "string" || !/^\d+\.\d{2}$/.test(amount)) throw new Error("Ongeldig betaalresultaat");
  const cents = Number(BigInt(amount.replace(".", "")));
  if (!Number.isSafeInteger(cents) || cents <= 0 || attempt.provider !== "mollie" ||
    !/^tr_[a-zA-Z0-9_-]+$/.test(payment.id) || (attempt.provider_payment_id && payment.id !== attempt.provider_payment_id) ||
    payment.mode !== attempt.provider_mode || cents !== attempt.amount_cents || payment.amount.currency !== attempt.currency ||
    !attempt.invoice_group_id || payment.metadata?.payment_attempt_id !== attempt.id ||
    payment.metadata?.tenant_id !== attempt.tenant_id || payment.metadata?.invoice_group_id !== attempt.invoice_group_id ||
    !["open", "pending", "paid", "failed", "expired", "canceled"].includes(payment.status))
    throw new Error("Betaalresultaat hoort niet bij deze betaling");
  return cents;
}

export function verifiedStoredCheckout(href: string | null | undefined) {
  if (!href) throw new Error("Betaalomgeving is niet beschikbaar");
  const url = new URL(href);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !(url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com")))
    throw new Error("Onbekende betaalomgeving");
  return url.href;
}

export function verifiedCheckout(payment: MolliePayment) {
  return verifiedStoredCheckout(payment._links?.checkout?.href);
}
