import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const apps = [
  ["artifacts/backoffice", "/admin"],
  ["artifacts/klant-pwa", "/klant"],
  ["artifacts/personeel-pwa", "/personeel"],
];

test("Supabase auth cookies are host-keyed and host-only per Fieldgrid app", () => {
  for (const [app, expectedPath] of apps) {
    const helper = read(`${app}/src/lib/supabase/session-cookies.ts`);
    assert.match(helper, /SUPABASE_AUTH_COOKIE_PREFIX = "fieldgrid-auth"/u, `${app} should use Fieldgrid auth cookie prefix`);
    assert.match(helper, /supabaseAuthCookieName\(host/u, `${app} should derive cookie name from host`);
    assert.match(helper, /const \{ domain: _domain, \.\.\.hostOnlyOptions \} = options;/u, `${app} should strip cookie domain`);
    assert.doesNotMatch(helper, /domain:\s*["'`]/u, `${app} should not configure a shared cookie domain`);
    assert.match(helper, new RegExp(`path: ${expectedPath === "/admin" ? "BACKOFFICE_BASE_PATH" : expectedPath === "/klant" ? "CUSTOMER_BASE_PATH" : "PERSONNEL_BASE_PATH"}`, "u"), `${app} should scope auth cookies to ${expectedPath}`);
    assert.doesNotMatch(helper, /path:\s*["'`]\/["'`]/u, `${app} must not expose auth cookies to the website root`);

    const browserClient = read(`${app}/src/lib/supabase/client.ts`);
    assert.match(browserClient, /window\.location\.host/u, `${app} browser client should key cookies by current host`);
    assert.match(browserClient, /cookieOptions: createSupabaseCookieOptions\(host\)/u, `${app} browser client should pass cookieOptions`);

    const serverClient = read(`${app}/src/lib/supabase/server.ts`);
    assert.match(serverClient, /headers\(\)/u, `${app} server client should read request host`);
    assert.match(serverClient, /cookieOptions: createSupabaseCookieOptions\(host\)/u, `${app} server client should pass cookieOptions`);
    assert.match(serverClient, /withHostOnlyCookieOptions\(options\)/u, `${app} server client should strip domain on writes`);

    const middleware = read(`${app}/src/middleware.ts`);
    assert.match(middleware, /cookieOptions: createSupabaseCookieOptions\(host\)/u, `${app} middleware should pass cookieOptions`);
    assert.match(middleware, /withHostOnlyCookieOptions\(options\)/u, `${app} middleware should strip domain on writes`);
    assert.match(middleware, /Object\.entries\(responseHeaders\)/u, `${app} middleware should forward Supabase cache headers`);

    const confirmRoute = read(`${app}/src/app/auth/confirm/route.ts`);
    assert.match(confirmRoute, /cookieOptions: createSupabaseCookieOptions\(host\)/u, `${app} confirm route should pass cookieOptions`);
    assert.match(confirmRoute, /withHostOnlyCookieOptions\(options\)/u, `${app} confirm route should strip domain on writes`);
    assert.match(confirmRoute, /Object\.entries\(responseHeaders\)/u, `${app} confirm route should forward Supabase cache headers`);
  }
});

test("Backoffice tenant selection cookies are host-only", () => {
  const tenantSwitcher = read("artifacts/backoffice/src/app/actions/tenant-switcher.ts");
  const platformActions = read("artifacts/backoffice/src/app/actions/platform.ts");

  assert.match(tenantSwitcher, /withHostOnlyCookieOptions\(\{/u);
  assert.match(platformActions, /withHostOnlyCookieOptions\(\{/u);
  assert.doesNotMatch(tenantSwitcher, /domain:\s*["'`]/u);
  assert.doesNotMatch(platformActions, /domain:\s*["'`]/u);
  assert.match(tenantSwitcher, /path: BACKOFFICE_BASE_PATH/u);
  assert.match(platformActions, /path: BACKOFFICE_BASE_PATH/u);
});
