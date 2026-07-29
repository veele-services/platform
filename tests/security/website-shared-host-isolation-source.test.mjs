import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("backoffice owns a real admin base path and middleware normalizes only that namespace", () => {
  const config = read("artifacts/backoffice/next.config.ts");
  const middleware = read("artifacts/backoffice/src/middleware.ts");
  const paths = read("artifacts/backoffice/src/lib/backoffice-paths.ts");
  assert.match(config, /basePath: "\/admin"/u);
  assert.match(paths, /BACKOFFICE_BASE_PATH = "\/admin"/u);
  assert.match(paths, /normalized\.startsWith\(`\$\{BACKOFFICE_BASE_PATH\}\?`\)/u);
  assert.match(paths, /backofficePath only accepts same-origin paths/u);
  assert.match(middleware, /stripBackofficeBasePath\(pathname\)/u);
  assert.match(middleware, /backofficePath\("\/login"\)/u);
  assert.match(middleware, /backofficePath\("\/profiel-instellen"\)/u);
});

test("each application session and auxiliary cookie is restricted to its owning path", () => {
  const backoffice = read("artifacts/backoffice/src/lib/supabase/session-cookies.ts");
  const personnel = read("artifacts/personeel-pwa/src/lib/supabase/session-cookies.ts");
  const customer = read("artifacts/klant-pwa/src/lib/supabase/session-cookies.ts");
  const tenantSwitcher = read("artifacts/backoffice/src/app/actions/tenant-switcher.ts");
  const platform = read("artifacts/backoffice/src/app/actions/platform.ts");
  const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
  const personnelAuth = read("artifacts/personeel-pwa/src/actions/auth.ts");
  const customerAuth = read("artifacts/klant-pwa/src/actions/auth.ts");
  assert.match(backoffice, /path: BACKOFFICE_BASE_PATH/gu);
  assert.match(personnel, /path: PERSONNEL_BASE_PATH/gu);
  assert.match(customer, /path: CUSTOMER_BASE_PATH/gu);
  assert.match(tenantSwitcher, /path: BACKOFFICE_BASE_PATH/u);
  assert.match(platform, /path: BACKOFFICE_BASE_PATH/gu);
  assert.match(auth, /path: BACKOFFICE_BASE_PATH/u);
  assert.match(auth, /delete\(\{ name: RECOVERY_COOKIE, path: BACKOFFICE_BASE_PATH \}\)/gu);
  assert.match(personnelAuth, /delete\(\{ name: RECOVERY_COOKIE, path: "\/personeel" \}\)/gu);
  assert.match(customerAuth, /delete\(\{ name: RECOVERY_COOKIE, path: "\/klant" \}\)/gu);
  for (const source of [backoffice, personnel, customer, tenantSwitcher, platform, auth]) {
    assert.doesNotMatch(source, /path:\s*["'`]\/["'`]/u);
  }
});

test("raw backoffice browser and e-mail URLs use the explicit public-path helper", () => {
  const address = read("artifacts/backoffice/src/components/google-maps/AddressAutocomplete.tsx");
  const map = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");
  const search = read("artifacts/backoffice/src/components/knowledgebase/KnowledgebaseAutocompleteSearch.tsx");
  const email = read("artifacts/backoffice/src/lib/email.ts");
  const customerEmail = read("artifacts/klant-pwa/src/lib/email.ts");
  const personnelEmail = read("artifacts/personeel-pwa/src/lib/email.ts");
  const authConfirm = read("artifacts/backoffice/src/app/auth/confirm/route.ts");
  const rootLayout = read("artifacts/backoffice/src/app/layout.tsx");
  const releaseForm = read("artifacts/backoffice/src/components/releases/ReleaseForm.tsx");
  const mediaRenderer = read("artifacts/backoffice/src/components/knowledgebase/KnowledgebaseContentRenderer.tsx");
  assert.match(address, /fetch\(`\$\{backofficePath\(endpointBase\)\}\/autocomplete`/u);
  assert.match(map, /fetch\(backofficePath\("\/backoffice-api\/google-maps\/usage"\)/u);
  assert.match(search, /fetch\(`\$\{backofficePath\(endpoint\)\}\?q=/u);
  assert.match(email, /backofficeBaseUrl/u);
  assert.match(email, /https:\/\/admin\.fieldgrid\.nl\/admin/u);
  assert.match(email, /reportUrl: `\$\{backofficeUrl\(\)\}\/reports/u);
  assert.match(email, /leaveUrl: `\$\{backofficeUrl\(\)\}\/personnel\/verlof`/u);
  assert.match(email, /quotesUrl: `\$\{backofficeUrl\(\)\}\/quotes`/u);
  assert.match(customerEmail, /quotesUrl: `\$\{backofficeUrl\(\)\}\/quotes`/u);
  assert.match(personnelEmail, /reportUrl: `\$\{backofficeUrl\(\)\}\/reports`/u);
  assert.match(personnelEmail, /leaveUrl: `\$\{backofficeUrl\(\)\}\/personnel\/verlof`/u);
  assert.match(authConfirm, /backofficePath\("\/reset-wachtwoord"\)/u);
  assert.match(rootLayout, /icons: \{ icon: "\/admin\/favicon\.svg" \}/u);
  assert.match(releaseForm, /src=\{backofficePath\(`/u);
  assert.match(mediaRenderer, /backofficePath\(mediaBasePath\)/u);
});

test("route precedence and browser evidence keep website root separate from authenticated apps", () => {
  const routing = read("lib/website-core/src/shared-host-routing.ts");
  const golden = read("e2e/fieldgrid/tests/golden-path.spec.ts");
  const stack = read("e2e/fieldgrid/start-real-apps.mjs");
  const docs = read("docs/deployment/website-shared-host-routing.md");
  const runnerDocs = read("docs/deployment/self-hosted-runner.md");
  const websiteMiddleware = read("artifacts/website-runtime/src/middleware.ts");
  const apiProxy = read("artifacts/api-server/src/routes/platform-backoffice.ts");
  assert.ok(routing.indexOf("FIELDGRID_SHARED_HOST_PATHS.backoffice") < routing.indexOf("FIELDGRID_SHARED_HOST_PATHS.personnel"));
  assert.ok(routing.indexOf("FIELDGRID_SHARED_HOST_PATHS.personnel") < routing.indexOf("FIELDGRID_SHARED_HOST_PATHS.customer"));
  assert.ok(routing.indexOf("FIELDGRID_SHARED_HOST_PATHS.customer") < routing.indexOf("isPlatformApiPath(pathname)"));
  assert.match(routing, /filterWebsiteCookieHeader/u);
  assert.match(golden, /9321\/admin/u);
  assert.match(golden, /expect\(response\?\.status\(\)\)\.toBe\(404\)/u);
  assert.match(golden, /rootCookieHeader.*not\.toContain\("fieldgrid_e2e_auth_user"\)/su);
  assert.match(stack, /"\/admin\/login"/u);
  assert.match(stack, /path: "\/admin\/customers"/u);
  assert.match(
    docs,
    /Phase 9 staging activation contract implemented; live configuration/u,
  );
  assert.match(websiteMiddleware, /resolveWebsiteDeliveryByHost/u);
  assert.match(websiteMiddleware, /X-Fieldgrid-Website-Delivery/u);
  assert.match(runnerDocs, /@backoffice path \/admin \/admin\/\*/u);
  assert.match(
    runnerDocs,
    /redir @backoffice_login_alias \/admin\/login\?\{query\} 308/u,
  );
  assert.match(runnerDocs, /@platform_api path \/api \/api\/\*/u);
  assert.doesNotMatch(runnerDocs, /^\s*handle_path|^\s*handle \/admin\*/mu);
  assert.match(apiProxy, /new URL\(`\/admin\$\{req\.originalUrl\}`/u);
  assert.match(apiProxy, /"\/admin\/backoffice-api"/u);
});
