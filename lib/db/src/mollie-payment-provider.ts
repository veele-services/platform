export const PAYMENT_METADATA_SCHEMA = "fieldgrid-payment-v1";

export type FieldgridPaymentMetadata = {
  schemaVersion: typeof PAYMENT_METADATA_SCHEMA;
  purpose: "invoice_payment" | "invoice_collection_payment";
  paymentIntentId: string;
  tenantId: string;
  customerId: string;
  sourceType: "invoice" | "invoice_collection";
  sourceId: string;
};

export type MolliePaymentSnapshot = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  metadata: FieldgridPaymentMetadata;
  mode: string;
  profileId: string;
  checkoutUrl: string | null;
  providerCreatedAt: Date | null;
  providerStatusAt: Date | null;
  paidAt: Date | null;
  reversalObserved: boolean;
};

export class AmbiguousProviderResultError extends Error {
  readonly ambiguous = true;

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AmbiguousProviderResultError";
  }
}

function decimalAmountToCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/u.test(value)) {
    throw new Error("Mollie returned a non-canonical decimal amount.");
  }
  const [euros, cents] = value.split(".");
  const parsed = Number(euros) * 100 + Number(cents);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Mollie returned an invalid payment amount.");
  }
  return parsed;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function parseSnapshot(
  raw: unknown,
  requireCheckout: boolean,
): MolliePaymentSnapshot {
  if (!raw || typeof raw !== "object")
    throw new Error("Mollie returned an invalid payment object.");
  const payment = raw as Record<string, unknown>;
  const amount = payment.amount as Record<string, unknown> | undefined;
  const links = payment._links as Record<string, unknown> | undefined;
  const checkout = links?.checkout as Record<string, unknown> | undefined;
  const metadata = payment.metadata;
  const id = payment.id;
  const status = payment.status;
  const mode = payment.mode;
  const profileId = payment.profileId;
  const currency = amount?.currency;
  const checkoutUrl = typeof checkout?.href === "string" ? checkout.href : null;
  const refunds = (payment._embedded as Record<string, unknown> | undefined)
    ?.refunds;
  const chargebacks = (payment._embedded as Record<string, unknown> | undefined)
    ?.chargebacks;
  const amountRefunded = payment.amountRefunded as
    | Record<string, unknown>
    | undefined;

  if (
    typeof id !== "string" ||
    !id.startsWith("tr_") ||
    typeof status !== "string" ||
    typeof currency !== "string" ||
    typeof mode !== "string" ||
    typeof profileId !== "string" ||
    !metadata ||
    typeof metadata !== "object" ||
    (requireCheckout && !checkoutUrl)
  ) {
    throw new Error("Mollie returned an incomplete payment envelope.");
  }

  const statusAt =
    parseDate(payment.paidAt) ??
    parseDate(payment.canceledAt) ??
    parseDate(payment.expiredAt) ??
    parseDate(payment.failedAt) ??
    parseDate(payment.authorizedAt) ??
    parseDate(payment.createdAt);

  return {
    id,
    status,
    amountCents: decimalAmountToCents(amount?.value),
    currency,
    metadata: metadata as FieldgridPaymentMetadata,
    mode,
    profileId,
    checkoutUrl,
    providerCreatedAt: parseDate(payment.createdAt),
    providerStatusAt: statusAt,
    paidAt: parseDate(payment.paidAt),
    reversalObserved:
      (Array.isArray(refunds) && refunds.length > 0) ||
      (Array.isArray(chargebacks) && chargebacks.length > 0) ||
      (typeof amountRefunded?.value === "string" &&
        amountRefunded.value !== "0.00"),
  };
}

function providerBaseUrl(): string {
  return (process.env.MOLLIE_API_BASE_URL ?? "https://api.mollie.com").replace(
    /\/$/u,
    "",
  );
}

function providerKey(): string {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) throw new Error("MOLLIE_API_KEY is not configured.");
  return key;
}

export async function createMolliePayment(input: {
  requestKey: string;
  amountCents: number;
  currency: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata: FieldgridPaymentMetadata;
}): Promise<MolliePaymentSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${providerBaseUrl()}/v2/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.requestKey,
      },
      body: JSON.stringify({
        amount: {
          currency: input.currency,
          value: (input.amountCents / 100).toFixed(2),
        },
        description: input.description,
        redirectUrl: input.redirectUrl,
        webhookUrl: input.webhookUrl,
        metadata: input.metadata,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new AmbiguousProviderResultError(
      error instanceof Error && error.name === "AbortError"
        ? "Mollie timed out after accepting an idempotent request."
        : "The Mollie request outcome is unknown.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 409) {
    throw new AmbiguousProviderResultError(
      "Mollie is still reconciling this idempotent request.",
      409,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(`Mollie error: ${body.detail ?? response.statusText}`);
  }
  return parseSnapshot(await response.json(), true);
}

export async function fetchMolliePayment(
  paymentId: string,
): Promise<MolliePaymentSnapshot> {
  const response = await fetch(
    `${providerBaseUrl()}/v2/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `Bearer ${providerKey()}` },
    },
  );
  if (!response.ok)
    throw new Error(
      `Mollie payment fetch failed with HTTP ${response.status}.`,
    );
  const snapshot = parseSnapshot(await response.json(), false);
  if (snapshot.id !== paymentId)
    throw new Error("Mollie returned a different payment ID.");
  return snapshot;
}

export function assertProviderEnvelope(
  snapshot: MolliePaymentSnapshot,
  expected: {
    amountCents: number;
    currency: string;
    metadata: FieldgridPaymentMetadata;
    mode?: string | null;
    profileId?: string | null;
  },
): void {
  if (snapshot.amountCents !== expected.amountCents)
    throw new Error("Provider amount mismatch.");
  if (snapshot.currency !== expected.currency)
    throw new Error("Provider currency mismatch.");
  for (const [key, value] of Object.entries(expected.metadata)) {
    if (snapshot.metadata[key as keyof FieldgridPaymentMetadata] !== value) {
      throw new Error(`Provider metadata mismatch for ${key}.`);
    }
  }
  if (expected.mode && snapshot.mode !== expected.mode)
    throw new Error("Provider mode mismatch.");
  if (expected.profileId && snapshot.profileId !== expected.profileId) {
    throw new Error("Provider profile mismatch.");
  }
}
