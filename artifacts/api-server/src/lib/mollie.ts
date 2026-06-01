import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Mollie webhook request using HMAC-SHA256.
 *
 * Mollie's webhook security model does not mandate a standard signature header,
 * but this helper implements the pattern requested by the platform:
 *   HMAC-SHA256(rawBody, MOLLIE_WEBHOOK_SECRET) compared to x-mollie-signature.
 *
 * Always use timingSafeEqual to prevent timing attacks.
 *
 * @param body      Raw request body as a string (before JSON/form parsing).
 * @param signature Value of the x-mollie-signature header.
 * @param secret    MOLLIE_WEBHOOK_SECRET env var value.
 * @returns         true if the signature is valid, false otherwise.
 */
export function verifyMollieSignature(
  body:      string,
  signature: string,
  secret:    string,
): boolean {
  if (!body || !signature || !secret) return false;
  try {
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const sigBuf   = Buffer.from(signature, "hex");
    const expBuf   = Buffer.from(expected,  "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
