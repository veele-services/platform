import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const DELIVERY_TIMEOUT_MS = 8_000;

const textField = (label: string, min: number, max: number) =>
  z
    .string({
      required_error: `${label} ontbreekt.`,
      invalid_type_error: `${label} is ongeldig.`,
    })
    .trim()
    .min(min, `${label} is te kort.`)
    .max(max, `${label} is te lang.`);

const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Dit veld mag maximaal ${max} tekens bevatten.`)
    .optional()
    .transform((value) => value || undefined);

const leadSchema = z
  .object({
    kind: z.enum(["contact", "offerte", "sollicitatie"]),
    name: textField("Naam", 2, 120),
    organisation: optionalField(160),
    email: z
      .string({
        required_error: "E-mailadres ontbreekt.",
        invalid_type_error: "E-mailadres is ongeldig.",
      })
      .trim()
      .max(254, "E-mailadres is te lang.")
      .email("Vul een geldig e-mailadres in."),
    phone: optionalField(40).refine(
      (value) => !value || /^[+()\d\s.-]{6,40}$/.test(value),
      "Vul een geldig telefoonnummer in.",
    ),
    message: textField("Uw vraag", 10, 4_000),
    consent: z.preprocess(
      (value) =>
        value === true ||
        value === "true" ||
        value === "on" ||
        value === "yes" ||
        value === "1",
      z.literal(true, {
        errorMap: () => ({ message: "Toestemming is vereist." }),
      }),
    ),
    website: z.string().max(200).optional().default(""),
  })
  .strict();

type Lead = z.infer<typeof leadSchema>;
type FormKind = Lead["kind"];
type RateEntry = { count: number; resetAt: number };

const rateStore = new Map<string, RateEntry>();
const rateSalt = randomBytes(32);

function response(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(rateSalt).update(source).digest("hex");
}

function checkRateLimit(request: Request) {
  const now = Date.now();

  if (rateStore.size > 2_000) {
    for (const [key, entry] of rateStore) {
      if (entry.resetAt <= now) rateStore.delete(key);
    }
  }

  const key = requestFingerprint(request);
  const current = rateStore.get(key);
  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const };
  }

  current.count += 1;
  if (current.count <= RATE_LIMIT_MAX_REQUESTS) return { allowed: true as const };

  return {
    allowed: false as const,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

function allowedOrigins(request: Request) {
  const configured = process.env.FORM_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localOrigin = process.env.NODE_ENV === "production" ? [] : [new URL(request.url).origin];

  if (configured?.length) return [...configured, ...localOrigin];
  if (process.env.NEXT_PUBLIC_SITE_URL) return [process.env.NEXT_PUBLIC_SITE_URL, ...localOrigin];
  return process.env.NODE_ENV === "production" ? ["https://www.veeleservices.nl"] : localOrigin;
}

function hasTrustedOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  if (process.env.NODE_ENV !== "production") {
    try {
      if (["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)) return true;
    } catch {
      return false;
    }
  }

  return allowedOrigins(request).some((allowed) => {
    try {
      return new URL(allowed).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  });
}

type DeliveryResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "temporarily_unavailable" };

async function deliver(lead: Lead, requestId: string): Promise<DeliveryResult> {
  const mode = process.env.FORM_DELIVERY_MODE ?? "disabled";

  if (mode === "stub") {
    return process.env.NODE_ENV === "production"
      ? { ok: false, reason: "not_configured" }
      : { ok: true };
  }

  if (mode !== "webhook") return { ok: false, reason: "not_configured" };

  const endpoint = process.env.FORM_DELIVERY_WEBHOOK_URL;
  if (!endpoint) return { ok: false, reason: "not_configured" };

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, reason: "not_configured" };
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    return { ok: false, reason: "not_configured" };
  }

  const secret = process.env.FORM_DELIVERY_WEBHOOK_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const deliveryResponse = await fetch(url, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        version: 1,
        requestId,
        submittedAt: new Date().toISOString(),
        lead,
      }),
    });

    return deliveryResponse.ok
      ? { ok: true }
      : { ok: false, reason: "temporarily_unavailable" };
  } catch {
    return { ok: false, reason: "temporarily_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleLeadRequest(
  request: Request,
  expectedKind: FormKind | readonly FormKind[],
) {
  const requestId = randomUUID();

  if (!hasTrustedOrigin(request)) {
    return response({ ok: false, code: "origin_not_allowed", requestId }, 403);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return response({ ok: false, code: "unsupported_media_type", requestId }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return response({ ok: false, code: "payload_too_large", requestId }, 413);
  }

  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return response(
      { ok: false, code: "rate_limited", requestId },
      429,
      { "Retry-After": String(rateLimit.retryAfter) },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return response({ ok: false, code: "invalid_request", requestId }, 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return response({ ok: false, code: "payload_too_large", requestId }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response({ ok: false, code: "invalid_json", requestId }, 400);
  }

  const parsed = leadSchema.safeParse(payload);
  const acceptedKinds = Array.isArray(expectedKind) ? expectedKind : [expectedKind];
  if (!parsed.success || !acceptedKinds.includes(parsed.data.kind)) {
    return response(
      {
        ok: false,
        code: "validation_failed",
        requestId,
        fields: parsed.success ? { kind: ["Ongeldig formuliertype."] } : parsed.error.flatten().fieldErrors,
      },
      422,
    );
  }

  // Bots receive an indistinguishable success response, but nothing is delivered.
  if (parsed.data.website) {
    return response({ ok: true, requestId }, 202);
  }

  const delivery = await deliver(parsed.data, requestId);
  if (!delivery.ok) {
    return response(
      {
        ok: false,
        code: delivery.reason,
        requestId,
        message:
          delivery.reason === "not_configured"
            ? "Het formulier is nog niet gekoppeld. Neem rechtstreeks contact met ons op."
            : "Versturen lukt tijdelijk niet. Probeer het later opnieuw.",
      },
      503,
      { "Retry-After": "300" },
    );
  }

  return response({ ok: true, requestId }, 202);
}
