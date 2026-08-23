import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectEmailProviderForMessage } from "../../lib/db/src/email-provider-resolution.ts";

const root = new URL("../../", import.meta.url);

test("cross-tenant SMTP candidates fail closed", () => {
  const tenantB = {
    id: "smtp-b",
    scope: { kind: "tenant", tenantId: "tenant-b" },
  };
  assert.equal(
    selectEmailProviderForMessage({
      messageTenantId: "tenant-a",
      tenantProvider: tenantB,
    }),
    null,
  );
});

test("email service has no global organization-settings SMTP fallback", async () => {
  const service = await readFile(new URL("lib/db/src/email-service.ts", root), "utf8");

  assert.doesNotMatch(service, /getLegacySmtpProvider|legacy_smtp/u);
  assert.doesNotMatch(
    service,
    /where\(eq\(organizationSettingsTable\.smtpEnabled,\s*true\)\)/u,
  );
  assert.match(
    service,
    /where\(eq\(organizationSettingsTable\.tenantId,\s*tenantId\)\)/u,
  );
  assert.match(service, /isTenantRuntimeActive/u);
  assert.match(service, /selectEmailProviderForMessage/u);
});
