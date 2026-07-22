import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("backoffice invitations no longer treat an email address as a completed name", () => {
  const profile = read("artifacts/backoffice/src/lib/auth/backoffice-profile.ts");
  const invites = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  const tenantRoles = read("artifacts/backoffice/src/app/actions/tenant-roles.ts");

  assert.match(profile, /BACKOFFICE_PROFILE_NAME_REQUIRED/u);
  assert.match(profile, /name\.includes\("@"\)/u);
  assert.match(profile, /identity\.app_metadata\?\.\["portal"\] === "tenant-admin"/u);
  assert.match(invites, /validateBackofficeProfileName\(opts\.fullName, email\)/u);
  assert.match(invites, /userMetadata = profileName \? \{ full_name: profileName, name: profileName \} : \{\}/u);
  assert.match(invites, /opts\.portal === "tenant-admin" && !profileName/u);
  assert.match(tenantRoles, /fullName: ""/u);
  assert.match(tenantRoles, /credential_activation_pending === true \|\| !authUser\.confirmed_at/u);
});

test("account activation requires and stores a valid name before consuming the recovery grant", () => {
  const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
  const forgot = read("artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx");
  const reset = read("artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx");

  const nameValidation = auth.indexOf('validateBackofficeProfileName(formData.get("fullName"))');
  const grantConsumption = auth.indexOf("consumeCredentialRecoveryGrant({", nameValidation);
  assert.ok(nameValidation >= 0, "activation must validate the submitted name");
  assert.ok(grantConsumption > nameValidation, "invalid names must not consume the one-time grant");
  assert.match(auth, /recovery\.purpose === "activation"/u);
  assert.match(auth, /full_name: activationProfileName/u);
  assert.match(auth, /delete appMetadata\[BACKOFFICE_PROFILE_NAME_REQUIRED\]/u);
  assert.match(forgot, /\/reset-wachtwoord\?doel=activatie/u);
  assert.match(reset, /name="fullName"/u);
  assert.match(reset, /Volledige naam/u);
  assert.match(reset, /isActivation && !fullName\.trim\(\)/u);
});

test("incomplete invited profiles are fail-closed until onboarding is completed", () => {
  const middleware = read("artifacts/backoffice/src/middleware.ts");
  const permissions = read("artifacts/backoffice/src/lib/auth/permissions.ts");
  const layout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const onboarding = read("artifacts/backoffice/src/app/(auth)/profiel-instellen/page.tsx");

  assert.match(middleware, /requiresBackofficeProfileName\(user\) && !isProfileSetupPage/u);
  assert.match(middleware, /proxyAwareUrl\(backofficePath\("\/profiel-instellen"\), request\)/u);
  assert.match(permissions, /if \(requiresBackofficeProfileName\(user\)\) return new Set\(\)/u);
  assert.match(layout, /if \(requiresBackofficeProfileName\(user\)\) \{\s*redirect\(backofficePath\("\/profiel-instellen"\)\)/u);
  assert.match(onboarding, /if \(!requiresBackofficeProfileName\(user\)\) redirect\(BACKOFFICE_BASE_PATH\)/u);
  assert.match(onboarding, /BackofficeNameForm[^>]+onboarding/u);
});

test("backoffice users can update their own visible name from the profile page", () => {
  const action = read("artifacts/backoffice/src/app/actions/profile.ts");
  const form = read("artifacts/backoffice/src/components/profile/BackofficeNameForm.tsx");
  const profilePage = read("artifacts/backoffice/src/app/(dashboard)/profile/page.tsx");
  const dashboardLayout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const header = read("artifacts/backoffice/src/components/layout/DashboardHeader.tsx");

  assert.match(action, /getCurrentTenantId\(\)/u);
  assert.match(action, /admin\.auth\.admin\.getUserById\(user\.id\)/u);
  assert.match(action, /admin\.auth\.admin\.updateUserById\(user\.id/u);
  assert.match(action, /full_name: validatedName\.name/u);
  assert.match(action, /action: "update_own_profile"/u);
  assert.match(form, /updateOwnBackofficeProfile/u);
  assert.match(form, /autoComplete="name"/u);
  assert.match(profilePage, /BackofficeNameForm initialName=\{name \?\? ""\}/u);
  assert.match(dashboardLayout, /userName=\{userName\}/u);
  assert.match(header, /\{userName\}/u);
});
