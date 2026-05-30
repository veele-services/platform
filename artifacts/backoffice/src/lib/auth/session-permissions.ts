/**
 * Signed permissions cookie utilities.
 *
 * The sign-in Server Action writes a signed `veele_perms` cookie containing
 * the authenticated user's permission set.  The Next.js middleware reads this
 * cookie to enforce route-level RBAC without a database round-trip (Edge
 * Runtime cannot use the PostgreSQL driver).
 *
 * Security properties:
 * - httpOnly — not accessible to client-side JavaScript
 * - HMAC-SHA256 signed with SESSION_SECRET — tamper-evident
 * - Expiry matches the Supabase session window (7 days)
 *
 * Limitations:
 * - Cookie reflects permissions at login time.  If roles are reassigned, the
 *   middleware uses stale data until the user re-authenticates.
 * - Server Components always re-verify via hasPermission() (DB query), which
 *   is the authoritative access-control layer.
 */

const COOKIE_NAME = "veele_perms";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Import the SESSION_SECRET as a HMAC-SHA256 CryptoKey. */
async function importKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Base64url encode (URL-safe, no padding). */
function b64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Base64url decode back to ArrayBuffer. */
function unb64url(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Sign a permissions array into a `payload.signature` string.
 * Uses HMAC-SHA256 with SESSION_SECRET.
 */
export async function signPermissions(permissions: string[]): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");

  const payload = b64url(enc.encode(JSON.stringify(permissions)).buffer);
  const key = await importKey(secret);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/**
 * Verify the cookie value and return the permissions array, or null if
 * the signature is invalid or the payload is malformed.
 */
export async function verifyPermissions(cookie: string): Promise<string[] | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  try {
    const dot = cookie.lastIndexOf(".");
    if (dot === -1) return null;

    const payload = cookie.slice(0, dot);
    const sigB64  = cookie.slice(dot + 1);

    const key = await importKey(secret);
    const sig = unb64url(sigB64);

    const valid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      enc.encode(payload),
    );
    if (!valid) return null;

    return JSON.parse(dec.decode(unb64url(payload))) as string[];
  } catch {
    return null;
  }
}

export { COOKIE_NAME, COOKIE_MAX_AGE };
