import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const WEBSITE_PREVIEW_TOKEN_VERSION = "fgwp1";
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function requirePreviewSecret(secret: string): string {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Website preview signing secret must be at least 32 bytes");
  }
  return secret;
}

function signature(unsignedToken: string, secret: string): string {
  return createHmac("sha256", requirePreviewSecret(secret))
    .update("fieldgrid-website-preview:v1\0")
    .update(unsignedToken)
    .digest("base64url");
}

export function createWebsitePreviewToken(secret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  const unsignedToken = `${WEBSITE_PREVIEW_TOKEN_VERSION}.${nonce}`;
  return `${unsignedToken}.${signature(unsignedToken, secret)}`;
}

export function verifyWebsitePreviewToken(
  token: string,
  secret: string,
): boolean {
  const [version, nonce, suppliedSignature, extra] = token.split(".");
  if (
    extra !== undefined ||
    version !== WEBSITE_PREVIEW_TOKEN_VERSION ||
    !nonce ||
    !suppliedSignature ||
    !TOKEN_PART_PATTERN.test(nonce) ||
    !TOKEN_PART_PATTERN.test(suppliedSignature)
  ) {
    return false;
  }

  const expectedSignature = signature(`${version}.${nonce}`, secret);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function hashWebsitePreviewToken(token: string): string {
  return createHash("sha256")
    .update("fieldgrid-website-preview-token:v1\0")
    .update(token)
    .digest("hex");
}
