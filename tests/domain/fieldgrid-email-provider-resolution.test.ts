import assert from "node:assert/strict";
import test from "node:test";
import {
  selectEmailProviderForMessage,
  type FieldgridEmailProviderScope,
} from "../../lib/db/src/email-provider-resolution.ts";
import { isTenantRuntimeActive } from "../../lib/db/src/tenant-context.ts";

type Candidate = {
  id: string;
  scope: FieldgridEmailProviderScope;
};

const platform: Candidate = { id: "platform", scope: { kind: "platform" } };
const environment: Candidate = {
  id: "environment",
  scope: { kind: "fieldgrid_environment" },
};
const tenantA: Candidate = {
  id: "tenant-a-smtp",
  scope: { kind: "tenant", tenantId: "tenant-a" },
};
const tenantB: Candidate = {
  id: "tenant-b-smtp",
  scope: { kind: "tenant", tenantId: "tenant-b" },
};

test("exact tenants select only their own provider", () => {
  assert.equal(
    selectEmailProviderForMessage({ messageTenantId: "tenant-a", tenantProvider: tenantA }),
    tenantA,
  );
  assert.equal(
    selectEmailProviderForMessage({ messageTenantId: "tenant-b", tenantProvider: tenantB }),
    tenantB,
  );
});

test("a message can never select another tenant's provider", () => {
  assert.equal(
    selectEmailProviderForMessage({ messageTenantId: "tenant-a", tenantProvider: tenantB }),
    null,
  );
  assert.equal(
    selectEmailProviderForMessage({ tenantProvider: tenantB }),
    null,
  );
});

test("central platform and Fieldgrid environment providers are explicit fallbacks", () => {
  assert.equal(
    selectEmailProviderForMessage({
      messageTenantId: "tenant-a",
      platformProvider: platform,
      tenantProvider: tenantA,
      environmentProvider: environment,
    }),
    platform,
  );
  assert.equal(
    selectEmailProviderForMessage({
      messageTenantId: "tenant-a",
      tenantProvider: tenantB,
      environmentProvider: environment,
    }),
    environment,
  );
  assert.equal(selectEmailProviderForMessage({ messageTenantId: "tenant-a" }), null);
});

test("suspended, archived and inactive tenants are not lifecycle eligible", () => {
  assert.equal(isTenantRuntimeActive({ isActive: true, status: "trial" }), true);
  assert.equal(isTenantRuntimeActive({ isActive: true, status: "active" }), true);
  assert.equal(isTenantRuntimeActive({ isActive: true, status: "suspended" }), false);
  assert.equal(isTenantRuntimeActive({ isActive: true, status: "archived" }), false);
  assert.equal(isTenantRuntimeActive({ isActive: false, status: "active" }), false);
});
