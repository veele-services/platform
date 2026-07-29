import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
const origin = read("artifacts/backoffice/src/lib/auth/recovery-origin.ts");
const platformTenants = read(
  "artifacts/backoffice/src/app/actions/platform-tenants.ts",
);
const tenantPage = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
);
const platformUsers = read("artifacts/backoffice/src/app/actions/platform.ts");
const settings = read("artifacts/backoffice/src/app/actions/settings.ts");
const forgotPage = read(
  "artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx",
);
const resetPage = read(
  "artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx",
);
const recoveryDomain = read("lib/db/src/credential-recovery.ts");
const recoveryService = read("lib/db/src/credential-recovery-service.ts");
const platformUsersPage = read(
  "artifacts/backoffice/src/app/(platform)/platform/users/page.tsx",
);
const resetControl = read(
  "artifacts/backoffice/src/components/platform/PlatformTenantPasswordResetAction.tsx",
);
const platformUserResetControl = read(
  "artifacts/backoffice/src/components/platform/PlatformUserPasswordResetAction.tsx",
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

test("platform user reset returns inline delivery state instead of crashing the page", () => {
  const action = platformUsers.match(
    /export async function sendPlatformUserPasswordResetFromForm[\s\S]*?(?=export async function listSupportAccessGrants)/u,
  )?.[0];

  assert.ok(action);
  assert.match(action, /Promise<ActionResult/u);
  assert.match(action, /resolveBackofficeRecoveryContext\(resetUrl\)/u);
  assert.match(action, /deliveryStatus: "sent"/u);
  assert.match(action, /const bookkeepingFailures: string\[\] = \[\]/u);
  assert.match(action, /bookkeepingFailures\.push\("delivery-state"\)/u);
  assert.match(action, /bookkeepingFailures\.push\("audit"\)/u);
  assert.match(action, /bookkeepingFailures\.push\("revalidation"\)/u);
  assert.match(action, /was delivered; bookkeeping incomplete/u);
  assert.match(action, /catch \{/u);
  assert.doesNotMatch(action, /console\.error\([^)]*,\s*error/u);
  assert.doesNotMatch(action, /throw new Error/u);
  assert.match(platformUsersPage, /PlatformUserPasswordResetAction/u);
  assert.match(platformUserResetControl, /useActionState/u);
  assert.match(platformUserResetControl, /role="status"/u);
  assert.match(platformUserResetControl, /role="alert"/u);
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

test("backoffice reset e-mails open the code step through a signed non-PII handoff", () => {
  assert.match(recoveryDomain, /HANDOFF_DOMAIN/u);
  assert.match(recoveryDomain, /createCredentialRecoveryHandoff/u);
  assert.match(recoveryDomain, /verifyCredentialRecoveryHandoff/u);
  assert.match(recoveryDomain, /timingSafeEqual/u);
  assert.doesNotMatch(
    recoveryDomain.match(
      /export function createCredentialRecoveryHandoff[\s\S]*?(?=export function verifyCredentialRecoveryHandoff)/u,
    )?.[0] ?? "",
    /accountIdentifier|code/u,
  );
  assert.match(recoveryService, /inspectCredentialRecoveryChallenge/u);
  assert.match(
    recoveryService,
    /id = \$\{input\.challengeId\}::uuid[\s\S]*surface = \$\{input\.surface\}[\s\S]*purpose = \$\{input\.purpose\}[\s\S]*redirect_origin = \$\{input\.redirectOrigin\}/u,
  );

  for (const [name, source] of [
    ["public backoffice reset", auth],
    ["platform user reset", platformUsers],
    ["platform tenant reset", platformTenants],
    ["tenant user reset", settings],
  ]) {
    assert.match(source, /backofficeRecoveryHandoffUrl/u, name);
    assert.match(
      source,
      /backofficeRecoveryHandoffUrl\([\s\S]*challenge\.challengeId/u,
      name,
    );
  }

  assert.match(forgotPage, /params\.get\("herstel"\)/u);
  assert.match(forgotPage, /setSent\(true\)/u);
  assert.match(forgotPage, /\{ handoff \}/u);
  assert.doesNotMatch(
    forgotPage,
    /params\.get\("email"\)|params\.get\("code"\)/u,
  );
  assert.match(auth, /verifyCredentialRecoveryHandoff\(handoff\)/u);
  assert.match(auth, /inspectCredentialRecoveryChallenge\(/u);
});

test("password completion removes stale host session state before a hard login navigation", () => {
  assert.match(auth, /isSupabaseAuthCookieForHost/u);
  assert.match(auth, /const providerSessionRevoked = !error/u);
  assert.match(auth, /sessionRevoked: providerSessionRevoked/u);
  assert.match(
    auth,
    /cookieStore\.delete\(\{ name, path: BACKOFFICE_BASE_PATH \}\)/u,
  );
  assert.match(
    resetPage,
    /window\.location\.replace\(backofficePath\(`\/login\?/u,
  );
  assert.doesNotMatch(resetPage, /router\.push\(`\/login/u);
});

test("signed handoff verification is pinned to the exact challenge", () => {
  assert.match(auth, /return \{ account, challengeId, state: "valid" \}/u);
  assert.match(
    auth,
    /resolved\.challengeId \? \{ challengeId: resolved\.challengeId \} : \{\}/u,
  );
  assert.match(
    recoveryService,
    /context\.challengeId[\s\S]*AND id = \$\{context\.challengeId\}::uuid/u,
  );
});
