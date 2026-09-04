import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBackofficeDevelopmentFallbackHost,
  readBackofficeRequestHost,
} from "../../artifacts/backoffice/src/lib/auth/request-host.ts";

test("backoffice request hosts prefer one unambiguous forwarded host", () => {
  assert.deepEqual(
    readBackofficeRequestHost(
      new Headers({
        host: "internal.example:3000",
        "x-forwarded-host": "Tenant-A.Runtime.Fieldgrid.Test:9321",
      }),
      "production",
    ),
    { kind: "host", host: "tenant-a.runtime.fieldgrid.test" },
  );

  for (const forwardedHost of [
    "unknown.fieldgrid.nl, evil.example",
    "https://tenant-a.runtime.fieldgrid.test",
    "user@tenant-a.runtime.fieldgrid.test",
    "tenant-a.runtime.fieldgrid.test/admin",
  ]) {
    assert.deepEqual(
      readBackofficeRequestHost(
        new Headers({
          host: "tenant-a.runtime.fieldgrid.test",
          "x-forwarded-host": forwardedHost,
        }),
        "production",
      ),
      { kind: "blocked" },
      forwardedHost,
    );
  }
});

test("missing production hosts fail closed while local development remains explicit", () => {
  assert.deepEqual(readBackofficeRequestHost(new Headers(), "production"), {
    kind: "blocked",
  });
  assert.deepEqual(readBackofficeRequestHost(new Headers(), "development"), {
    kind: "none",
  });

  for (const host of ["localhost", "127.0.0.1", "::1"]) {
    assert.equal(
      isBackofficeDevelopmentFallbackHost(host, {
        nodeEnvironment: "development",
      }),
      true,
    );
    assert.equal(
      isBackofficeDevelopmentFallbackHost(host, {
        nodeEnvironment: "production",
      }),
      false,
    );
  }
});

test("development preview fallback matches only exact configured Replit hosts", () => {
  const options = {
    nodeEnvironment: "development",
    replitDomains: "preview-one.replit.dev, Preview-Two.Replit.Dev ",
  };

  assert.equal(
    isBackofficeDevelopmentFallbackHost("preview-two.replit.dev", options),
    true,
  );
  assert.equal(
    isBackofficeDevelopmentFallbackHost("evil-preview-two.replit.dev", options),
    false,
  );
  assert.equal(
    isBackofficeDevelopmentFallbackHost("preview-two.replit.dev", {
      ...options,
      nodeEnvironment: "production",
    }),
    false,
  );
});
