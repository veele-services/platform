import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const nextRedirectSources = [
  "artifacts/backoffice/src/app/(auth)/profiel-instellen/page.tsx",
  "artifacts/backoffice/src/app/(dashboard)/layout.tsx",
  "artifacts/backoffice/src/app/(platform)/layout.tsx",
  "artifacts/backoffice/src/app/actions/auth.ts",
  "artifacts/backoffice/src/app/actions/platform-provisioning.ts",
  "artifacts/backoffice/src/app/actions/platform-tenants.ts",
  "artifacts/backoffice/src/app/actions/platform.ts",
  "artifacts/backoffice/src/app/h/[tenantCode]/[slug]/page.tsx",
];

test("Next navigation redirects keep the configured admin base path implicit", () => {
  const paths = read("artifacts/backoffice/src/lib/backoffice-paths.ts");
  assert.match(
    paths,
    /export function backofficeRedirectPath\(path = "\/"\): string/u,
  );
  assert.match(paths, /normalized === BACKOFFICE_BASE_PATH\) return "\/"/u);
  assert.match(paths, /normalized\.slice\(BACKOFFICE_BASE_PATH\.length\)/u);
  assert.match(paths, /Next applies next\.config\.ts basePath itself/u);

  for (const path of nextRedirectSources) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /\bredirect\s*\(\s*backofficePath\s*\(/u,
      `${path} must not pass a public /admin path to Next redirect()`,
    );
    assert.doesNotMatch(
      source,
      /\bredirect\s*\(\s*`\$\{backofficePath\s*\(/u,
      `${path} must not interpolate a public /admin path into Next redirect()`,
    );
    assert.doesNotMatch(
      source,
      /\bredirect\s*\(\s*BACKOFFICE_BASE_PATH\b/u,
      `${path} must let Next apply basePath exactly once`,
    );
  }
});

test("root, login, profile and post-login destinations use basePath-free routes", () => {
  const dashboard = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const platform = read("artifacts/backoffice/src/app/(platform)/layout.tsx");
  const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
  const profile = read(
    "artifacts/backoffice/src/app/(auth)/profiel-instellen/page.tsx",
  );

  assert.match(dashboard, /redirect\(backofficeRedirectPath\("\/login"\)\)/u);
  assert.match(
    dashboard,
    /redirect\(backofficeRedirectPath\("\/profiel-instellen"\)\)/u,
  );
  assert.match(platform, /backofficeRedirectPath\("\/platform"\)/u);
  assert.match(auth, /return backofficeRedirectPath\(next\)/u);
  assert.match(auth, /redirect\(backofficeRedirectPath\("\/login"\)\)/u);
  assert.match(profile, /redirect\(backofficeRedirectPath\(\)\)/u);
});

test("raw middleware redirects still include the browser-visible admin prefix", () => {
  const middleware = read("artifacts/backoffice/src/middleware.ts");

  assert.match(
    middleware,
    /NextResponse\.redirect\(loginUrlWithNext\(request\)\)/u,
  );
  assert.match(
    middleware,
    /proxyAwareUrl\(backofficePath\("\/profiel-instellen"\), request\)/u,
  );
});
