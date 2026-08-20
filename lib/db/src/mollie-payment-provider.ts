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

export type MollieProviderFailureKind =
  | "timeout"
  | "network"
  | "client_error"
  | "server_error"
  | "malformed_response"
  | "envelope_mismatch";

export class MollieProviderError extends Error {
  constructor(
    message: string,
    readonly kind: MollieProviderFailureKind,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MollieProviderError";
  }
}

export class AmbiguousProviderResultError extends MollieProviderError {
  readonly ambiguous = true;

  constructor(
    message: string,
    status?: number,
    kind: "timeout" | "network" | "client_error" = "network",
  ) {
    super(message, kind, true, status);
    this.name = "AmbiguousProviderResultError";
  }
}

const DEFAULT_MOLLIE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_MOLLIE_RESPONSE_BYTES = 1_048_576;

function requestTimeoutMs(): number {
  const configured = process.env.MOLLIE_REQUEST_TIMEOUT_MS;
  if (!configured) return DEFAULT_MOLLIE_REQUEST_TIMEOUT_MS;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 60_000) {
    throw new Error("MOLLIE_REQUEST_TIMEOUT_MS must be between 1 and 60000.");
  }
  return parsed;
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MOLLIE_RESPONSE_BYTES
  ) {
    throw new MollieProviderError(
      "Mollie returned an oversized response.",
      "malformed_response",
      true,
      response.status,
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_MOLLIE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new MollieProviderError(
        "Mollie returned an oversized response.",
        "malformed_response",
        true,
        response.status,
      );
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

async function requestMollie(input: {
  path: string;
  init?: RequestInit;
  ambiguousTransportResult: boolean;
  ambiguousStatuses?: readonly number[];
}): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(`${providerBaseUrl()}${input.path}`, {
      ...input.init,
      headers: {
        Authorization: `Bearer ${providerKey()}`,
        ...input.init?.headers,
      },
      signal: controller.signal,
    });
    const rawBody = await readBoundedResponseBody(response);

    if (input.ambiguousStatuses?.includes(response.status)) {
      throw new AmbiguousProviderResultError(
        "Mollie is still reconciling this idempotent request.",
        response.status,
        "client_error",
      );
    }
    if (!response.ok) {
      let detail: string | undefined;
      try {
        const parsed = JSON.parse(rawBody) as { detail?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
      } catch {
        // HTTP status remains authoritative when an error body is not JSON.
      }
      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      throw new MollieProviderError(
        detail
          ? `Mollie rejected the request: ${detail}`
          : `Mollie request failed with HTTP ${response.status}.`,
        response.status >= 500 ? "server_error" : "client_error",
        retryable,
        response.status,
      );
    }

    try {
      return { status: response.status, body: JSON.parse(rawBody) as unknown };
    } catch {
      throw new MollieProviderError(
        "Mollie returned malformed JSON.",
        "malformed_response",
        true,
        response.status,
      );
    }
  } catch (error) {
    if (error instanceof MollieProviderError) throw error;
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    if (input.ambiguousTransportResult) {
      throw new AmbiguousProviderResultError(
        timedOut
          ? "Mollie timed out after accepting an idempotent request."
          : "The Mollie request outcome is unknown.",
        undefined,
        timedOut ? "timeout" : "network",
      );
    }
    throw new MollieProviderError(
      timedOut ? "Mollie request timed out." : "Mollie network request failed.",
      timedOut ? "timeout" : "network",
      true,
    );
  } finally {
    clearTimeout(timeout);
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

function parseProviderSnapshot(
  raw: unknown,
  requireCheckout: boolean,
): MolliePaymentSnapshot {
  try {
    return parseSnapshot(raw, requireCheckout);
  } catch (error) {
    throw new MollieProviderError(
      error instanceof Error
        ? error.message
        : "Mollie returned an invalid payment envelope.",
      "envelope_mismatch",
      true,
    );
  }
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
  const response = await requestMollie({
    path: "/v2/payments",
    ambiguousTransportResult: true,
    ambiguousStatuses: [409],
    init: {
      method: "POST",
      headers: {
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
    },
  });
  return parseProviderSnapshot(response.body, true);
}

export async function fetchMolliePayment(
  paymentId: string,
): Promise<MolliePaymentSnapshot> {
  const response = await requestMollie({
    path: `/v2/payments/${encodeURIComponent(paymentId)}`,
    ambiguousTransportResult: false,
  });
  const snapshot = parseProviderSnapshot(response.body, false);
  if (snapshot.id !== paymentId) {
    throw new MollieProviderError(
      "Mollie returned a different payment ID.",
      "envelope_mismatch",
      false,
      response.status,
    );
  }
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
