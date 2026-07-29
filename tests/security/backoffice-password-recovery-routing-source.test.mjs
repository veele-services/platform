import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
const origin = read(
  "artifacts/backoffice/src/lib/auth/recovery-origin.ts",
);
const platformTenants = read(
  "artifacts/backoffice/src/app/actions/platform-tenants.ts",
);
const tenantPage = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
);
const resetControl = read(
  "artifacts/backoffice/src/components/platform/PlatformTenantPasswordResetAction.tsx",
);

test("empty recovery allowlist falls back safely after environment and host validation", () => {
  assert.match(origin, /FIELDGRID_RECOVERY_ALLOWED_ORIGINS/u);
  assert.match(origin, /\.filter\(Boolean\)/u);
  assert.match(origin, /configuredOrigins\.length === 0/u);
  assert.match(origin, /resolveTenantByHost\(host\)/u);
  assert.match(origin, /isConfiguredPlatformHost\(host\)/u);
  assert.match(origin, /isFieldgridHostAllowedForRuntimeEnvironment/u);
  assert.match(origin, /resolveCredentialRecoveryOrigin/u);
  assert.match(origin, /deploymentEnvironment/u);
});

test("public backoffice recovery derives its exact surface and tenant from the request host", () => {
  assert.match(origin, /x-forwarded-host/u);
  assert.match(origin, /x-forwarded-proto/u);
  assert.match(origin, /surface = "platform-admin"/u);
  assert.match(origin, /surface = "tenant-backoffice"/u);
  assert.match(auth, /currentBackofficeRecoveryContext\(\)/u);
  assert.match(auth, /context\.surface === "platform-admin"/u);
  assert.match(auth, /context\.surface === "tenant-backoffice"/u);
  assert.match(auth, /membership\.tenantId === context\.tenantId/u);
  assert.match(auth, /backofficeRecoveryUrl\(context\)/u);
});

test("a recovery grant cannot be consumed on another tenant or surface", () => {
  assert.match(
    auth,
    /recoveryContext\.surface !== recovery\.surface[\s\S]*recoveryContext\.tenantId !== recovery\.tenantId/u,
  );
  assert.match(auth, /Deze herstelsessie hoort niet bij dit portaal/u);
  assert.match(auth, /redirectOrigin: recoveryContext\.origin/u);
});

test("platform tenant reset returns inline delivery state instead of crashing the page", () => {
  const action = platformTenants.match(
    /export async function sendPlatformTenantAdminPasswordReset[\s\S]*?(?=export async function updatePlatformTenantOwnerInvite)/u,
  )?.[0];

  assert.ok(action);
  assert.match(action, /Promise<ActionResult/u);
  assert.match(action, /resolveBackofficeRecoveryContext\(resetUrl\)/u);
  assert.match(action, /recoveryContext\.tenantId !== tenantId/u);
  assert.match(action, /markCredentialRecoveryDelivery/u);
  assert.match(action, /deliveryStatus: "sent"/u);
  assert.doesNotMatch(action, /redirect\(/u);
  assert.match(tenantPage, /PlatformTenantPasswordResetAction/u);
  assert.match(resetControl, /useActionState/u);
  assert.match(resetControl, /role="status"/u);
  assert.match(resetControl, /role="alert"/u);
});

test("public response remains generic and does not disclose account or delivery state", () => {
  const requestAction = auth.match(
    /export async function requestPasswordResetCode[\s\S]*?(?=export async function verifyPasswordResetCode)/u,
  )?.[0];

  assert.ok(requestAction);
  assert.match(requestAction, /const publicResult:[^=]*= \{ success: true \}/u);
  assert.match(requestAction, /return publicResult/u);
  assert.doesNotMatch(requestAction, /sent\.success/u);
});
