import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWebsitePreviewToken,
  hashWebsitePreviewToken,
  verifyWebsitePreviewToken,
} from "../src/preview-token";

const secret = "fieldgrid-preview-test-secret-with-at-least-32-bytes";

test("preview token is opaque, signed and stored through a deterministic digest", () => {
  const token = createWebsitePreviewToken(secret);
  assert.match(token, /^fgwp1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/u);
  assert.equal(verifyWebsitePreviewToken(token, secret), true);
  assert.match(hashWebsitePreviewToken(token), /^[0-9a-f]{64}$/u);
  assert.equal(hashWebsitePreviewToken(token), hashWebsitePreviewToken(token));
  assert.doesNotMatch(token, /tenant|site|user|revision/u);
});

test("preview token fails closed for tampering, wrong secrets and malformed input", () => {
  const token = createWebsitePreviewToken(secret);
  const [version, nonce, tokenSignature] = token.split(".");
  const tamperedNonce = `${nonce!.slice(0, -1)}${nonce!.endsWith("A") ? "B" : "A"}`;
  const tamperedSignature = `${tokenSignature!.slice(0, -1)}${
    tokenSignature!.endsWith("A") ? "B" : "A"
  }`;

  assert.equal(
    verifyWebsitePreviewToken(
      `${version}.${tamperedNonce}.${tokenSignature}`,
      secret,
    ),
    false,
  );
  assert.equal(
    verifyWebsitePreviewToken(
      `${version}.${nonce}.${tamperedSignature}`,
      secret,
    ),
    false,
  );
  assert.equal(
    verifyWebsitePreviewToken(
      token,
      "a-different-preview-secret-with-at-least-32-bytes",
    ),
    false,
  );
  assert.equal(verifyWebsitePreviewToken("not-a-token", secret), false);
});

test("preview token refuses weak signing secrets", () => {
  assert.throws(
    () => createWebsitePreviewToken("too-short"),
    /at least 32 bytes/u,
  );
});
