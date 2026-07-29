import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const actions = read(
  "artifacts/backoffice/src/app/actions/platform-websites.ts",
);
const page = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
);
const initializer = read(
  "artifacts/backoffice/src/components/platform/PlatformManagedWebsiteInitializer.tsx",
);
const authoring = read("lib/db/src/website-authoring-service.ts");

test("platform website initialization requires platform authority and trusted tenant data", () => {
  const action = actions.match(
    /export async function initializePlatformManagedWebsiteAction[\s\S]*?(?=export async function registerPlatformWebsiteDeploymentAction)/u,
  )?.[0];

  assert.ok(action);
  assert.match(action, /requirePlatformAdmin\(\)/u);
  assert.match(action, /getWebsiteAdminOverview\(tenantId\)/u);
  assert.match(action, /current\.tenantName/u);
  assert.match(action, /actorUserId: actor\.userId/u);
  assert.doesNotMatch(action, /formData.*tenantName/u);
});

test("platform initialization is idempotent and creates managed draft content only", () => {
  assert.match(actions, /if \(current\.site\)/u);
  assert.match(actions, /const afterFailure = await getWebsiteAdminOverview/u);
  assert.match(actions, /if \(!afterFailure\.site\) throw error/u);
  assert.match(actions, /templateKey: "trust_conversion"/u);
  assert.match(actions, /Er is niets gepubliceerd/u);
  assert.doesNotMatch(
    actions.match(
      /export async function initializePlatformManagedWebsiteAction[\s\S]*?(?=export async function registerPlatformWebsiteDeploymentAction)/u,
    )?.[0] ?? "",
    /publish|activatePlatformWebsiteDeployment|registerPlatformWebsiteDeployment/u,
  );
  assert.match(authoring, /delivery_mode,[\s\S]*'managed_cms'/u);
  assert.match(authoring, /status, is_primary[\s\S]*'draft', true/u);
});

test("platform UI requires confirmation and exposes initialization only when no site exists", () => {
  assert.match(page, /if \(!delivery\.site\)/u);
  assert.match(page, /PlatformManagedWebsiteInitializer/u);
  assert.match(initializer, /Managed website initialiseren/u);
  assert.match(initializer, /Conceptsite aanmaken/u);
  assert.match(initializer, /publiceert niets/u);
  assert.match(initializer, /activeert geen domein/u);
  assert.match(initializer, /start geen[\s\S]*deployment/u);
  assert.match(initializer, /role=\{state\.success \? "status" : "alert"\}/u);
});

test("tenant and platform initialization share one canonical settings factory", () => {
  const tenantPage = read(
    "artifacts/backoffice/src/app/(dashboard)/website/page.tsx",
  );

  assert.match(authoring, /export function createInitialWebsiteSettings/u);
  assert.match(
    tenantPage,
    /createInitialWebsiteSettings\(overview\.tenantName\)/u,
  );
  assert.match(actions, /createInitialWebsiteSettings\(current\.tenantName\)/u);
});
