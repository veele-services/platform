import "server-only";

import { requireProvider } from "@/lib/env/server";
import { mollieAmount } from "@/lib/domain/payments";

export type MolliePayment = {
  id: string;
  profileId?: string;
  mode: "test" | "live";
  status: "open" | "pending" | "paid" | "failed" | "expired" | "canceled";
  amount: { currency: string; value: string };
  metadata?: Record<string, unknown> | null;
  _links?: { checkout?: { href: string } };
};

async function mollieRequest<T = MolliePayment>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = requireProvider("MOLLIE_API_KEY");
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(`https://api.mollie.com/v2${path}`, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Mollie gaf HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function createMolliePayment(input: { amountCents: number; description: string; redirectUrl: string; metadata: Record<string, string>; idempotencyKey: string }) {
  return mollieRequest("/payments", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: { currency: "EUR", value: mollieAmount(input.amountCents) },
      description: input.description,
      redirectUrl: input.redirectUrl,
      webhookUrl: requireProvider("MOLLIE_WEBHOOK_URL"),
      metadata: input.metadata,
    }),
  });
}

export async function getMolliePayment(paymentId: string) {
  return mollieRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function getMollieProfile() {
  return mollieRequest<{ id: string }>("/profiles/me");
}
