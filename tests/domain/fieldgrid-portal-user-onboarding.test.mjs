import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const dbRequire = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const ts = require("typescript");
const contractFilename = new URL(
  "../../lib/db/src/portal-onboarding.ts",
  import.meta.url,
);
const compiledContract = ts.transpileModule(
  readFileSync(contractFilename, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const contractModule = { exports: {} };
vm.runInNewContext(
  compiledContract,
  {
    module: contractModule,
    exports: contractModule.exports,
    require(id) {
      if (id === "./portal-onboarding-client") {
        return {
          PORTAL_ONBOARDING_PORTALS: ["personnel", "customer"],
          PORTAL_PUSH_STATUSES: [
            "not_asked",
            "allowed",
            "denied",
            "unsupported",
            "revoked",
            "expired",
          ],
          PERSONNEL_ONBOARDING_STEPS: [
            "welcome",
            "profile",
            "transport",
            "work",
            "availability",
            "notifications",
            "review",
          ],
          CUSTOMER_ONBOARDING_STEPS: [
            "welcome",
            "organization",
            "contact",
            "notifications",
            "review",
          ],
          portalOnboardingAccessState(metadata, portal) {
            return {
              passwordChangeRequired: metadata?.force_password_change === true,
              onboardingRequired:
                metadata?.portal === portal &&
                metadata?.portal_onboarding_required === true &&
                metadata?.portal_onboarding_status !== "completed",
            };
          },
        };
      }
      if (id === "zod/v4") return dbRequire(id);
      return require(id);
    },
  },
  { filename: contractFilename.pathname },
);
const contract = contractModule.exports;

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("new personnel and customer invitations require versioned onboarding", () => {
  const invites = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  assert.match(invites, /portal === "personnel" \|\| portal === "customer"/u);
  assert.match(
    invites,
    /metadata\[PORTAL_ONBOARDING_REQUIRED_METADATA\] = true/u,
  );
  assert.match(
    invites,
    /metadata\[PORTAL_ONBOARDING_STATUS_METADATA\] = "not_started"/u,
  );
  assert.match(
    invites,
    /metadata\[PORTAL_ONBOARDING_VERSION_METADATA\] = PORTAL_ONBOARDING_VERSION/u,
  );
  assert.match(invites, /delete metadata\["force_password_change"\]/u);
});

test("portal onboarding access is tenant-bound and ordered after required password change", () => {
  const contract = read("lib/db/src/portal-onboarding-client.ts");
  for (const [portal, actionPrefix] of [
    ["personeel", "personnel"],
    ["klant", "customer"],
  ]) {
    const middleware = read(`artifacts/${portal}-pwa/src/middleware.ts`);
    const layout = read(`artifacts/${portal}-pwa/src/app/(app)/layout.tsx`);
    const onboardingPage = read(
      `artifacts/${portal}-pwa/src/app/(onboarding)/onboarding/page.tsx`,
    );
    const membershipGuard =
      `${actionPrefix}OnboardingRequiredForCurrentMembership`;
    assert.match(
      middleware,
      /access\.passwordChangeRequired && !isRequiredPasswordPage/u,
    );
    assert.doesNotMatch(middleware, /access\.onboardingRequired/u);
    assert.match(layout, new RegExp(membershipGuard, "u"));
    assert.match(
      onboardingPage,
      new RegExp(`!\\(await ${membershipGuard}\\(\\)\\)`, "u"),
    );
    assert.match(middleware, /auth\.getUser\(\)/u);
  }
  assert.match(contract, /metadata\?\.\["force_password_change"\] === true/u);
  assert.match(
    contract,
    /metadata\?\.\[PORTAL_ONBOARDING_REQUIRED_METADATA\] === true/u,
  );
  assert.match(
    contract,
    /PORTAL_ONBOARDING_STATUS_METADATA\] !== "completed"/u,
  );
});

test("onboarding is resumable and canonical data is committed only at completion", () => {
  for (const portal of ["personeel", "klant"]) {
    const actions = read(`artifacts/${portal}-pwa/src/actions/onboarding.ts`);
    assert.match(actions, /portalOnboardingSessionsTable/u);
    assert.match(actions, /portalOnboardingStepCompletionsTable/u);
    assert.match(actions, /draftData: draft/u);
    assert.match(actions, /action: "save_onboarding_step"/u);
    assert.match(actions, /action: "complete_onboarding"/u);
    assert.match(actions, /profileCompletenessPercentage: 100/u);
    assert.match(
      actions,
      /PORTAL_ONBOARDING_REQUIRED_METADATA\] = Boolean\(pendingSession\)/u,
    );
    assert.match(actions, /portalOnboardingStatus: "completed"/u);
    assert.match(
      actions,
      /portalOnboardingVersion: PORTAL_ONBOARDING_VERSION/u,
    );
    assert.match(
      actions,
      /eq\(portalOnboardingSessionsTable\.revision, session\.revision\)/u,
    );
    assert.match(
      actions,
      /revision: sql`\$\{portalOnboardingSessionsTable\.revision\} \+ 1`/u,
    );
  }
  const personnel = read("artifacts/personeel-pwa/src/actions/onboarding.ts");
  const customer = read("artifacts/klant-pwa/src/actions/onboarding.ts");
  const personnelCompletion = personnel.slice(
    personnel.indexOf("completePersonnelOnboarding"),
  );
  const customerCompletion = customer.slice(
    customer.indexOf("completeCustomerOnboarding"),
  );
  assert.ok(
    personnelCompletion.indexOf("update(personnelTable)") >= 0,
  );
  assert.ok(
    customerCompletion.indexOf("update(customersTable)") >= 0,
  );
});

test("role-specific wizards validate on the server and require an explicit push attempt", () => {
  const contract = read("lib/db/src/portal-onboarding.ts");
  const personnel = read("artifacts/personeel-pwa/src/actions/onboarding.ts");
  const customer = read("artifacts/klant-pwa/src/actions/onboarding.ts");
  assert.match(contract, /personnelProfileOnboardingSchema/u);
  assert.match(contract, /personnelAvailabilityOnboardingSchema/u);
  assert.match(contract, /customerOrganizationOnboardingSchema/u);
  assert.match(contract, /customerContactOnboardingSchema/u);
  assert.match(personnel, /if \(!parsed\.data\.pushAttempted\)/u);
  assert.match(customer, /if \(!parsed\.data\.pushAttempted\)/u);
  assert.match(personnel, /parsed\.data\.pushStatus !== "allowed"/u);
  assert.match(customer, /parsed\.data\.pushStatus !== "allowed"/u);
  assert.match(personnel, /critical \? true : preference\.emailEnabled/u);
  assert.match(customer, /critical \? true : preference\.inAppEnabled/u);
});

test("onboarding wizard clients stay browser-safe and mobile-first", () => {
  for (const [portal, component] of [
    ["personeel", "PersonnelOnboardingWizard.tsx"],
    ["klant", "CustomerOnboardingWizard.tsx"],
  ]) {
    const wizard = read(
      `artifacts/${portal}-pwa/src/components/onboarding/${component}`,
    );
    assert.match(wizard, /from "react-hook-form"/u);
    assert.match(wizard, /from "@workspace\/db\/portal-onboarding-client"/u);
    assert.doesNotMatch(wizard, /from "@workspace\/db"/u);
    assert.match(wizard, /Opslaan en later/u);
    assert.match(wizard, /min-h-12/u);
    assert.doesNotMatch(wizard, /overflow-x-auto|min-w-\[480px\]/u);
  }
});

test("profile validation normalizes contact data and validates Dutch postcodes", () => {
  const personnel = contract.personnelProfileOnboardingSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "06 12 34 56 78",
    addressStreet: "Kalverstraat 1",
    addressPostalCode: "1012 NX",
    addressCity: "Amsterdam",
    addressCountry: "Nederland",
  });
  assert.equal(personnel.success, true);
  assert.equal(personnel.data.phone, "+31612345678");

  const invalidPostcode = contract.personnelProfileOnboardingSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+31612345678",
    addressStreet: "Kalverstraat 1",
    addressPostalCode: "0000 AA",
    addressCity: "Amsterdam",
    addressCountry: "NL",
  });
  assert.equal(invalidPostcode.success, false);

  const customer = contract.customerOrganizationOnboardingSchema.safeParse({
    officialName: "Fieldgrid B.V.",
    tradeName: "Fieldgrid",
    legalForm: "B.V.",
    chamberOfCommerceNumber: "12345678",
    vatNumber: "NL 1234.56.789 B01",
    registrationCountry: "Nederland",
    businessPhone: "020-1234567",
    businessEmail: "info@example.test",
    addressStreet: "Dam 1",
    postalCode: "1012 JS",
    city: "Amsterdam",
    country: "Nederland",
  });
  assert.equal(customer.success, true);
  assert.equal(customer.data.vatNumber, "NL123456789B01");
});

test("availability validation rejects backwards windows", () => {
  const windows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    available: dayOfWeek === 0,
    onRequest: false,
    startTime: dayOfWeek === 0 ? "17:00" : "08:00",
    endTime: dayOfWeek === 0 ? "08:00" : "17:00",
  }));
  const parsed = contract.personnelAvailabilityOnboardingSchema.safeParse({
    windows,
    availabilityConfirmed: true,
  });
  assert.equal(parsed.success, false);
});

test("on-request-only availability cannot be silently discarded at completion", () => {
  const windows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    available: false,
    onRequest: dayOfWeek === 0,
    startTime: "08:00",
    endTime: "17:00",
  }));
  const parsed = contract.personnelAvailabilityOnboardingSchema.safeParse({
    windows,
    availabilityConfirmed: true,
  });
  assert.equal(parsed.success, false);
});

test("required password change updates password and metadata in one admin operation", () => {
  for (const [portal, expectedPortal] of [
    ["personeel", "personnel"],
    ["klant", "customer"],
  ]) {
    const actions = read(`artifacts/${portal}-pwa/src/actions/auth.ts`);
    const start = actions.indexOf(
      "export async function completeRequiredPasswordChange",
    );
    const end = actions.indexOf(
      "export async function completePasswordReset",
      start,
    );
    const body = actions.slice(start, end);
    assert.match(
      body,
      new RegExp(
        `app_metadata\\?\\.\\["portal"\\] !== "${expectedPortal}"`,
        "u",
      ),
    );
    assert.match(
      body,
      /admin\.auth\.admin\.updateUserById\(user\.id, \{[\s\S]*password,[\s\S]*app_metadata: appMetadata/u,
    );
    assert.doesNotMatch(body, /supabase\.auth\.updateUser/u);
  }
});
