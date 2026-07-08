import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const moduleCache = new Map();

function resolveModule(fromFile, specifier) {
  if (specifier === "@workspace/db") return "lib/db/src/security-masking.ts";
  if (!specifier.startsWith(".")) throw new Error(`Unsupported test import: ${specifier}`);
  const candidate = path.normalize(path.join(path.dirname(fromFile), specifier));
  return candidate.endsWith(".ts") ? candidate : `${candidate}.ts`;
}

function loadTsModule(relativeFile) {
  const normalized = path.normalize(relativeFile);
  if (moduleCache.has(normalized)) return moduleCache.get(normalized).exports;

  const filename = path.join(root, normalized);
  const source = readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(normalized, module);
  const localRequire = (specifier) => loadTsModule(resolveModule(normalized, specifier));
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: localRequire,
    console,
  }, { filename });
  return module.exports;
}

const {
  authorizeFieldgridAccess,
} = loadTsModule("lib/db/src/security-permissions.ts");
const {
  toPlatformPaymentDiagnosticDto,
  toPlatformCustomerContactMaskedDto,
} = loadTsModule("artifacts/backoffice/src/lib/security/safe-dtos.ts");

test("sensitive permission behavior denies platform full access without grant", () => {
  const decision = authorizeFieldgridAccess({
    role: "platform_admin",
    scope: "tenant_invoices",
    accessLevel: "full_read",
    resourceTenantId: "tenant-a",
    hasActiveSensitiveGrant: false,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "sensitive_grant_required");
  assert.equal(decision.masked, true);
});

test("sensitive grant elevates non-developer platform roles only", () => {
  assert.equal(authorizeFieldgridAccess({
    role: "platform_admin",
    scope: "tenant_payments",
    accessLevel: "full_read",
    resourceTenantId: "tenant-a",
    hasActiveSensitiveGrant: true,
  }).allowed, true);

  const developerDecision = authorizeFieldgridAccess({
    role: "platform_developer",
    scope: "tenant_payments",
    accessLevel: "full_read",
    resourceTenantId: "tenant-a",
    hasActiveSensitiveGrant: true,
  });
  assert.equal(developerDecision.allowed, false);
  assert.equal(developerDecision.reason, "production_sensitive_data_denied");
});

test("support is masked by default while tenant finance can export own finance", () => {
  const supportDecision = authorizeFieldgridAccess({
    role: "platform_support",
    scope: "tenant_payments",
    accessLevel: "masked_read",
    resourceTenantId: "tenant-a",
  });
  assert.equal(supportDecision.allowed, true);
  assert.equal(supportDecision.masked, true);

  assert.equal(authorizeFieldgridAccess({
    role: "tenant_finance",
    scope: "tenant_invoices",
    accessLevel: "export",
    actorTenantId: "tenant-a",
    resourceTenantId: "tenant-a",
  }).allowed, true);

  assert.equal(authorizeFieldgridAccess({
    role: "tenant_staff",
    scope: "tenant_invoices",
    accessLevel: "export",
    actorTenantId: "tenant-a",
    resourceTenantId: "tenant-a",
  }).allowed, false);
});

test("cross-tenant resources are rejected before role permission", () => {
  const decision = authorizeFieldgridAccess({
    role: "tenant_owner",
    scope: "tenant_customers_contacts",
    accessLevel: "full_read",
    actorTenantId: "tenant-a",
    resourceTenantId: "tenant-b",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "cross_tenant_denied");
});

test("break-glass requires a reason", () => {
  assert.equal(authorizeFieldgridAccess({
    role: "platform_owner",
    scope: "security_logs",
    accessLevel: "break_glass",
  }).allowed, false);

  assert.equal(authorizeFieldgridAccess({
    role: "platform_owner",
    scope: "security_logs",
    accessLevel: "break_glass",
    breakGlassReason: "Incident response ticket FG-123",
  }).allowed, true);
});

test("platform DTO helpers mask payment and contact data", () => {
  const decision = {
    role: "platform_support",
    masked: true,
  };

  const payment = toPlatformPaymentDiagnosticDto({
    molliePaymentId: "tr_123456789abcdef",
    checkoutUrl: "https://checkout.example.invalid/pay/secret",
  }, decision);
  assert.notEqual(payment.molliePaymentId, "tr_123456789abcdef");
  assert.equal(payment.checkoutUrl, null);

  const contact = toPlatformCustomerContactMaskedDto({
    firstName: "Danny",
    lastName: "Goldenbelt",
    email: "danny@example.com",
    phone: "+31612345678",
  }, decision);
  assert.notEqual(contact.email, "danny@example.com");
  assert.notEqual(contact.phone, "+31612345678");
});

test("runtime resolver does not count platform roles on tenant host without support mode", () => {
  const source = readFileSync(path.join(root, "artifacts/backoffice/src/lib/security/sensitive-runtime.ts"), "utf8");
  assert.match(source, /isTenantRuntimeContext\s*=\s*currentTenantId\s*===\s*tenantId/u);
  assert.match(source, /supportMode\?\s*\.tenantId\s*===\s*tenantId\s*\|\|\s*!isTenantRuntimeContext/u);
});
